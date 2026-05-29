import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canonicalizeLinkedinUrl, linkedinPublicId } from "@/lib/linkedin";

/**
 * Public apply endpoint for the careers site.
 *
 * Accepts multipart form-data with the candidate's submission, validates
 * the job is currently publishable, finds-or-creates the candidate
 * (deduped by workspace + email), uploads the CV to the private
 * `hiring-resumes` bucket if provided, and creates an `application`
 * placed in the first stage of the job's pipeline.
 *
 * Uses the service-role admin client because:
 *   - The endpoint is reachable without auth (anon visitors).
 *   - RLS on hiring.candidates / applications scopes to workspace
 *     members. We validate the public job + perform the inserts on
 *     behalf of the visitor.
 *   - Storage upload bypasses the bucket's authenticated INSERT
 *     policy via service role; the bucket stays private to recruiters.
 *
 * SERVICE ROLE: public apply submission — see comment above for the
 * rationale. Every write is gated by the publication check.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * In-process IP rate limit: at most N submissions per IP per window.
 * Anti-spam, not anti-DDoS — for that we lean on Vercel's edge. The
 * Map lives in the module scope so it survives across requests on a
 * warm Fluid Compute instance; cold starts reset it, which is fine
 * (the limit is per-instance per-minute anyway).
 *
 * (job_id, email) collisions are already caught by the dedupe query
 * further down, so the rate limit only needs to handle the bot case
 * where a single IP fires many distinct emails.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const ipHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    ipHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return false;
}

function ipFor(req: Request): string {
  // x-forwarded-for is set by Vercel; first entry is the client.
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  if (rateLimited(ipFor(req))) {
    return bad("Demasiados envíos. Intenta de nuevo en un minuto.", 429);
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return bad("Cuerpo inválido");
  }

  // ----- Read + validate input -----
  const jobId = (fd.get("job_id") as string | null)?.trim() || "";
  const fullName = (fd.get("full_name") as string | null)?.trim() || "";
  const email = (fd.get("email") as string | null)?.trim().toLowerCase() || "";
  const phone = (fd.get("phone") as string | null)?.trim() || "";
  // Optional LinkedIn profile. We normalize light typos (missing
  // protocol, trailing slash) and accept blanks rather than rejecting
  // — the field is optional and the candidate shouldn't lose their
  // application over a malformed URL.
  // Canonicalize so the same profile never lands as two distinct rows
  // (trailing-slash / www / casing variants) across our write paths.
  const linkedinUrlRaw =
    (fd.get("linkedin_url") as string | null)?.trim() || "";
  const linkedinUrl = canonicalizeLinkedinUrl(linkedinUrlRaw);
  const linkedinPid = linkedinPublicId(linkedinUrl);
  const applicantLocation =
    (fd.get("location") as string | null)?.trim() || null;
  const salaryExpectationRaw =
    (fd.get("salary_expectation_amount") as string | null) ?? null;
  const salaryExpectationCurrency =
    (fd.get("salary_expectation_currency") as string | null)?.trim() || null;
  const screeningAnswersRaw =
    (fd.get("screening_answers") as string | null) ?? "";
  const cv = fd.get("cv");

  if (!jobId) return bad("Falta job_id");
  if (!fullName) return bad("El nombre es obligatorio");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return bad("El correo no es válido");
  }
  if (!phone) return bad("El teléfono es obligatorio");

  let screeningAnswers: unknown = null;
  if (screeningAnswersRaw) {
    try {
      screeningAnswers = JSON.parse(screeningAnswersRaw);
    } catch {
      return bad("Respuestas de screening con formato inválido");
    }
  }

  const salaryExpectation =
    salaryExpectationRaw && salaryExpectationRaw.trim() !== ""
      ? Number(salaryExpectationRaw)
      : null;
  if (
    salaryExpectation !== null &&
    (!Number.isFinite(salaryExpectation) || salaryExpectation < 0)
  ) {
    return bad("Expectativa de salario inválida");
  }

  // ----- Resolve the job + check it's publishable -----
  const admin = getSupabaseAdmin().schema("hiring");

  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .select(
      "id, workspace_id, status:job_statuses(is_open), publication_status, require_cv, ask_for_location, ask_for_salary_expectations, title",
    )
    .eq("id", jobId)
    .maybeSingle<{
      id: string;
      workspace_id: string;
      status: { is_open: boolean } | null;
      publication_status: string | null;
      require_cv: boolean;
      ask_for_location: boolean;
      ask_for_salary_expectations: boolean;
      title: string;
    }>();
  if (jobErr || !job) return bad("Vacante no encontrada", 404);
  if (job.status?.is_open !== true || job.publication_status === "draft") {
    return bad("Esta vacante no está publicada", 404);
  }

  // ----- CV upload (always required) -----
  // The per-job `require_cv` toggle used to gate this, but careers
  // applications now universally require a CV — the recruiter needs
  // the doc to do a real review. We ignore job.require_cv and reject
  // any submission that arrives without a file.
  if (!(cv instanceof File) || cv.size === 0) {
    return bad("Adjunta tu CV para aplicar");
  }
  if (cv.size > MAX_FILE_BYTES) {
    return bad("El CV no puede pesar más de 10 MB");
  }
  if (!ALLOWED_MIMES.has(cv.type)) {
    return bad("Formato no soportado. Sube un PDF o DOCX");
  }
  const ext =
    cv.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "pdf";
  const path = `careers-applications/${job.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const storage = getSupabaseAdmin().storage.from("hiring-resumes");
  const { error: upErr } = await storage.upload(path, cv, {
    contentType: cv.type,
    upsert: false,
  });
  if (upErr) {
    return bad("No se pudo subir el CV", 500);
  }
  // The bucket is private — store the path (not a public URL). The
  // app reads CVs via signed URLs / authenticated storage access.
  const resumeUrl: string = path;

  // ----- Find or create candidate -----
  // Dedupe by workspace + email first; then, if a LinkedIn was given,
  // by its public id — so a returning applicant (or someone we already
  // have from LinkedIn enrichment) doesn't spawn a duplicate row.
  const { data: existingByEmail } = await admin
    .from("candidates")
    .select("id")
    .eq("workspace_id", job.workspace_id)
    .eq("email", email)
    .maybeSingle();
  let existing = existingByEmail;
  if (!existing && linkedinPid) {
    const { data: byPid } = await admin
      .from("candidates")
      .select("id")
      .eq("workspace_id", job.workspace_id)
      .eq("linkedin_public_id", linkedinPid)
      .maybeSingle();
    existing = byPid;
  }

  let candidateId: string;
  if (existing?.id) {
    candidateId = existing.id as string;
    // Refresh the columns the candidate just re-typed. Old CV stays
    // accessible via storage history; we just repoint the row.
    const patch: Record<string, unknown> = {};
    if (resumeUrl) patch.resume_url = resumeUrl;
    if (linkedinUrl) patch.linkedin_url = linkedinUrl;
    if (linkedinPid) patch.linkedin_public_id = linkedinPid;
    if (Object.keys(patch).length > 0) {
      await admin.from("candidates").update(patch).eq("id", candidateId);
    }
  } else {
    const { data: newC, error: cErr } = await admin
      .from("candidates")
      .insert({
        workspace_id: job.workspace_id,
        full_name: fullName,
        email,
        phone,
        resume_url: resumeUrl,
        linkedin_url: linkedinUrl,
        linkedin_public_id: linkedinPid,
        default_source: "careers",
      })
      .select("id")
      .single();
    if (cErr || !newC) {
      return bad("No se pudo guardar tu información", 500);
    }
    candidateId = newC.id as string;
  }

  // Prevent duplicate applications to the same job. If they already
  // applied, just return success — the recruiter doesn't need a second
  // identical row.
  const { data: existingApp } = await admin
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_id", job.id)
    .maybeSingle();
  if (existingApp) {
    return NextResponse.json({
      ok: true,
      data: { applicationId: existingApp.id, duplicate: true },
    });
  }

  // ----- First-stage placement -----
  // Drop the new application in the first stage of the job's pipeline
  // (lowest position). category is mirrored from the stage so the
  // analytics rollup behaves the same way as candidates moved
  // manually.
  const { data: firstStage } = await admin
    .from("pipeline_stages")
    .select("id, category")
    .eq("job_id", job.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: app, error: appErr } = await admin
    .from("applications")
    .insert({
      workspace_id: job.workspace_id,
      candidate_id: candidateId,
      job_id: job.id,
      source: "careers",
      source_meta: {
        applicant_location: applicantLocation,
        salary_expectation_amount: salaryExpectation,
        salary_expectation_currency: salaryExpectationCurrency,
        screening_answers: screeningAnswers,
      },
      stage_id: firstStage?.id ?? null,
      category: firstStage?.category ?? null,
      applied_at: new Date().toISOString(),
      status_changed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (appErr || !app) {
    return bad("No se pudo registrar tu aplicación", 500);
  }

  return NextResponse.json({
    ok: true,
    data: { applicationId: app.id, duplicate: false },
  });
}
