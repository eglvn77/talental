"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hiring,
  DEFAULT_PIPELINE_STAGES,
  getRequestWorkspaceId,
  type CandidateSource,
  type CompanyStatus,
  type RoleStatus,
} from "@/lib/hiring";
import { parseResumeText, type ParsedProfile } from "@/lib/resume-parse";

const RESUME_BUCKET = "hiring-resumes";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAuthenticated())) return { ok: false, error: "Unauthorized" };
  return { ok: true };
}

async function seedDefaultStages(roleId: string, workspaceId: string): Promise<void> {
  const db = hiring();
  await db.from("pipeline_stages").insert(
    DEFAULT_PIPELINE_STAGES.map((s, i) => ({
      workspace_id: workspaceId,
      role_id: roleId,
      name: s.name,
      category: s.category,
      color: s.color,
      position: (i + 1) * 10,
      is_terminal: s.is_terminal ?? false,
      client_portal_visible: s.client_portal_visible ?? false,
    })),
  );
}

export async function createRoleAction(input: {
  companyId: string;
  clientContactEmail?: string;
  clientContactName?: string;
  title: string;
  publicDescription?: string;
  salaryMin?: number;
  salaryMax?: number;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string;
}): Promise<ActionResult<{ roleId: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;

  const title = input.title.trim();
  if (!input.companyId || !title) {
    return { ok: false, error: "Company and title are required" };
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = hiring();

  // Look up the company; this also validates the FK exists + workspace.
  const { data: company, error: companyErr } = await db
    .from("companies")
    .select("id, name, client_id, status")
    .eq("id", input.companyId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (companyErr || !company) {
    return { ok: false, error: "Company not found" };
  }

  // Find or create the clients row for billing context. Tied to the company
  // (so all roles for the same company share one clients record).
  let clientId = company.client_id as string | null;
  if (!clientId) {
    const email = input.clientContactEmail?.trim().toLowerCase() || null;
    const { data: createdClient, error: clientErr } = await db
      .from("clients")
      .insert({
        workspace_id: workspaceId,
        company_name: company.name as string,
        contact_email: email ?? `unknown+${company.id}@invalid`,
        contact_name: input.clientContactName?.trim() || null,
      })
      .select("id")
      .single();
    if (clientErr || !createdClient) {
      return {
        ok: false,
        error: clientErr?.message.slice(0, 300) || "Failed to create client",
      };
    }
    clientId = createdClient.id as string;
    await db.from("companies").update({
      client_id: clientId,
      status: company.status === "none" || company.status === "prospect" ? "client" : company.status,
    }).eq("id", company.id as string);
  }

  const { data: role, error: roleErr } = await db
    .from("roles")
    .insert({
      workspace_id: workspaceId,
      client_id: clientId,
      company_id: company.id as string,
      title,
      public_description: input.publicDescription?.trim() || null,
      salary_min: input.salaryMin ?? null,
      salary_max: input.salaryMax ?? null,
      location: input.location?.trim() || null,
      location_lat: input.locationLat ?? null,
      location_lng: input.locationLng ?? null,
      location_place_id: input.locationPlaceId ?? null,
      status: "draft" satisfies RoleStatus,
    })
    .select("id")
    .single();
  if (roleErr || !role) {
    return {
      ok: false,
      error: roleErr?.message.slice(0, 300) || "Failed to create role",
    };
  }

  await seedDefaultStages(role.id as string, workspaceId);

  revalidatePath("/jobs");
  return { ok: true, data: { roleId: role.id as string } };
}

export async function updateRoleAction(input: {
  roleId: string;
  title?: string;
  publicDescription?: string | null;
  fullDescription?: string | null;
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  aiScoringEnabled?: boolean;
  aiScoringCriteria?: string | null;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { ok: false, error: "Title cannot be empty" };
    patch.title = t;
  }
  if (input.publicDescription !== undefined)
    patch.public_description = input.publicDescription?.trim() || null;
  if (input.fullDescription !== undefined)
    patch.full_description = input.fullDescription?.trim() || null;
  if (input.location !== undefined)
    patch.location = input.location?.trim() || null;
  if (input.salaryMin !== undefined) patch.salary_min = input.salaryMin;
  if (input.salaryMax !== undefined) patch.salary_max = input.salaryMax;
  if (input.salaryCurrency !== undefined)
    patch.salary_currency = input.salaryCurrency || null;
  if (input.aiScoringEnabled !== undefined)
    patch.ai_scoring_enabled = input.aiScoringEnabled;
  if (input.aiScoringCriteria !== undefined)
    patch.ai_scoring_criteria = input.aiScoringCriteria?.trim() || null;

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to update" };
  }

  const { error } = await hiring()
    .from("roles")
    .update(patch)
    .eq("id", input.roleId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath(`/jobs/${input.roleId}`);
  revalidatePath("/jobs");
  return { ok: true };
}

export async function deleteRoleAction(roleId: string): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  // ON DELETE CASCADE on applications + pipeline_stages cleans those up.
  const { error } = await hiring().from("roles").delete().eq("id", roleId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/jobs");
  return { ok: true };
}

export async function updateRoleStatusAction(
  roleId: string,
  newStatus: RoleStatus,
): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const db = hiring();
  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === "paid") patch.paid_at = new Date().toISOString();
  if (newStatus === "published") patch.published_at = new Date().toISOString();
  if (newStatus === "closed") patch.closed_at = new Date().toISOString();
  const { error } = await db.from("roles").update(patch).eq("id", roleId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${roleId}`);
  return { ok: true };
}

export async function addCandidateAction(input: {
  roleId: string;
  fullName: string;
  email?: string;
  linkedinUrl?: string;
  source: CandidateSource;
}): Promise<ActionResult<{ applicationId: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Full name is required" };

  const workspaceId = await getRequestWorkspaceId();
  const db = hiring();

  let candidateId: string | undefined;
  const email = input.email?.trim().toLowerCase();
  const linkedin = input.linkedinUrl?.trim();
  if (email) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("email", email)
      .maybeSingle();
    candidateId = (data?.id as string | undefined) ?? undefined;
  }
  if (!candidateId && linkedin) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("linkedin_url", linkedin)
      .maybeSingle();
    candidateId = (data?.id as string | undefined) ?? undefined;
  }
  if (!candidateId) {
    const { data: created, error: insErr } = await db
      .from("candidates")
      .insert({
        workspace_id: workspaceId,
        full_name: fullName,
        email: email || null,
        linkedin_url: linkedin || null,
        default_source: input.source,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return {
        ok: false,
        error: insErr?.message.slice(0, 300) || "Failed to create candidate",
      };
    }
    candidateId = created.id as string;
  }

  // Place into the role's first stage (lowest position) — typically "Sourced".
  const { data: firstStage } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("role_id", input.roleId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: app, error: appErr } = await db
    .from("applications")
    .insert({
      workspace_id: workspaceId,
      candidate_id: candidateId,
      role_id: input.roleId,
      source: input.source,
      stage_id: (firstStage?.id as string | undefined) ?? null,
    })
    .select("id")
    .single();
  if (appErr || !app) {
    return {
      ok: false,
      error:
        appErr?.message.slice(0, 300) || "Failed to create application",
    };
  }

  revalidatePath(`/jobs/${input.roleId}`);
  return { ok: true, data: { applicationId: app.id as string } };
}

export async function moveApplicationToStageAction(
  applicationId: string,
  stageId: string,
): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const db = hiring();

  const { data: stage, error: stageErr } = await db
    .from("pipeline_stages")
    .select("id, role_id")
    .eq("id", stageId)
    .maybeSingle();
  if (stageErr || !stage) {
    return { ok: false, error: "Stage not found" };
  }

  const { error: updErr } = await db
    .from("applications")
    .update({ stage_id: stageId })
    .eq("id", applicationId)
    .eq("role_id", stage.role_id as string);
  if (updErr) return { ok: false, error: updErr.message.slice(0, 300) };

  revalidatePath(`/jobs/${stage.role_id as string}`);
  return { ok: true };
}

// Best-effort: derive a canonical domain from a website string.
// Accepts "example.com", "https://www.Example.COM/path", "http://x.example.com" → "example.com" (the last preserves subdomain only when it's not www).
function deriveDomain(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) return null;
  const withProto = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function clearbitLogoUrl(domain: string | null): string | null {
  if (!domain) return null;
  return `https://logo.clearbit.com/${encodeURIComponent(domain)}`;
}

export async function createCompanyAction(input: {
  name: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  status?: CompanyStatus;
}): Promise<ActionResult<{ companyId: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Company name is required" };

  const website = input.websiteUrl?.trim() || null;
  const domain = website ? deriveDomain(website) : null;
  const websiteCanonical = domain ? `https://${domain}` : website;
  const logoUrl = clearbitLogoUrl(domain);

  const workspaceId = await getRequestWorkspaceId();
  const db = hiring();

  // Dedupe by domain within the current workspace.
  if (domain) {
    const { data: existing } = await db
      .from("companies")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("domain", domain)
      .maybeSingle();
    if (existing) {
      return { ok: true, data: { companyId: existing.id as string } };
    }
  }

  const { data, error } = await db
    .from("companies")
    .insert({
      workspace_id: workspaceId,
      name,
      domain,
      website_url: websiteCanonical,
      linkedin_url: input.linkedinUrl?.trim() || null,
      logo_url: logoUrl,
      status: input.status ?? "prospect",
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || "Failed to create company",
    };
  }

  revalidatePath("/companies");
  return { ok: true, data: { companyId: data.id as string } };
}

export async function searchCompaniesAction(
  query: string,
  limit = 10,
): Promise<{ ok: true; data: Array<{ id: string; name: string; domain: string | null; logo_url: string | null; status: CompanyStatus }> } | { ok: false; error: string }> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const q = query.trim();
  const workspaceId = await getRequestWorkspaceId();
  const db = hiring();
  let req = db
    .from("companies")
    .select("id, name, domain, logo_url, status")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true })
    .limit(limit);
  if (q) {
    req = req.ilike("name", `%${q}%`);
  }
  const { data, error } = await req;
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return {
    ok: true,
    data: (data ?? []) as Array<{
      id: string;
      name: string;
      domain: string | null;
      logo_url: string | null;
      status: CompanyStatus;
    }>,
  };
}

export async function updateCompanyStatusAction(
  companyId: string,
  status: CompanyStatus,
): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { error } = await hiring()
    .from("companies")
    .update({ status })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/companies");
  return { ok: true };
}

// ============================================================
// Resume upload (Supabase Storage, private bucket, signed URLs)
// ============================================================

export async function uploadResumeAction(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const candidateId = String(formData.get("candidate_id") ?? "");
  const file = formData.get("file");
  if (!candidateId) return { ok: false, error: "Missing candidate id" };
  if (!(file instanceof File)) return { ok: false, error: "Missing file" };
  if (file.size === 0) return { ok: false, error: "File is empty" };
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "File exceeds 10 MB limit" };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  const path = `${candidateId}/${Date.now()}_${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const supabase = getSupabaseAdmin();
  const { error: upErr } = await supabase.storage
    .from(RESUME_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) {
    return { ok: false, error: upErr.message.slice(0, 300) };
  }

  // Best-effort: clean up the previous resume if any.
  const { data: prev } = await hiring()
    .from("candidates")
    .select("resume_url")
    .eq("id", candidateId)
    .maybeSingle();
  const prevPath = (prev?.resume_url as string | null) ?? null;

  const { error: updErr } = await hiring()
    .from("candidates")
    .update({ resume_url: path })
    .eq("id", candidateId);
  if (updErr) {
    // Roll back the just-uploaded blob to avoid orphan files.
    await supabase.storage.from(RESUME_BUCKET).remove([path]);
    return { ok: false, error: updErr.message.slice(0, 300) };
  }
  if (prevPath && prevPath !== path) {
    await supabase.storage.from(RESUME_BUCKET).remove([prevPath]);
  }

  const revalidate = String(formData.get("revalidate") ?? "");
  if (revalidate) revalidatePath(revalidate);
  return { ok: true, data: { path } };
}

export async function deleteResumeAction(input: {
  candidateId: string;
  revalidate?: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { data } = await hiring()
    .from("candidates")
    .select("resume_url")
    .eq("id", input.candidateId)
    .maybeSingle();
  const path = (data?.resume_url as string | null) ?? null;
  if (path) {
    await getSupabaseAdmin().storage.from(RESUME_BUCKET).remove([path]);
  }
  const { error } = await hiring()
    .from("candidates")
    .update({ resume_url: null })
    .eq("id", input.candidateId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true };
}

export async function parseResumeAction(input: {
  candidateId: string;
  /** When true, only fills empty candidate fields. Default true. */
  fillOnlyEmpty?: boolean;
  revalidate?: string;
}): Promise<ActionResult<{ parsed: ParsedProfile }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "Set ANTHROPIC_API_KEY in .env.local to enable resume parsing.",
    };
  }
  const db = hiring();
  const { data: cand, error: candErr } = await db
    .from("candidates")
    .select("id, full_name, email, phone, linkedin_url, resume_url")
    .eq("id", input.candidateId)
    .maybeSingle();
  if (candErr || !cand) {
    return { ok: false, error: candErr?.message.slice(0, 300) || "Not found" };
  }
  const path = cand.resume_url as string | null;
  if (!path) return { ok: false, error: "No resume on file" };

  const supabase = getSupabaseAdmin();
  const { data: blob, error: dlErr } = await supabase.storage
    .from(RESUME_BUCKET)
    .download(path);
  if (dlErr || !blob) {
    return { ok: false, error: dlErr?.message.slice(0, 300) || "Download failed" };
  }

  // Only PDFs are supported by pdf-parse. DOCX path can come later.
  const ct = blob.type || "";
  if (!ct.includes("pdf") && !path.toLowerCase().endsWith(".pdf")) {
    return {
      ok: false,
      error: "Only PDF parsing is supported right now (DOCX coming soon).",
    };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

  // pdf-parse v1: import the inner module directly. The package's index.js
  // runs a debug test on load that ENOENTs on the bundled sample file.
  type PdfParseFn = (
    data: Buffer,
  ) => Promise<{ text: string; numpages: number; info: unknown }>;
  // @ts-expect-error — no types for the inner path; we know the shape.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse: PdfParseFn =
    typeof mod === "function"
      ? (mod as PdfParseFn)
      : ((mod as { default: PdfParseFn }).default as PdfParseFn);
  let resumeText = "";
  try {
    const result = await pdfParse(Buffer.from(bytes));
    resumeText = result.text ?? "";
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : "PDF parse failed",
    };
  }
  if (!resumeText.trim()) {
    return { ok: false, error: "No extractable text in PDF (scanned image?)" };
  }

  let parsed: ParsedProfile;
  try {
    parsed = await parseResumeText(resumeText);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : "AI parse failed",
    };
  }

  // Build the patch: by default only fill blanks so we don't overwrite
  // recruiter-edited fields.
  const fillOnlyEmpty = input.fillOnlyEmpty ?? true;
  const patch: Record<string, unknown> = {
    parsed_profile: parsed,
    resume_text: resumeText.slice(0, 200_000),
  };
  function maybeFill(key: string, current: unknown, next: unknown) {
    if (next == null || (typeof next === "string" && !next.trim())) return;
    if (fillOnlyEmpty && current) return;
    patch[key] = next;
  }
  maybeFill("full_name", cand.full_name, parsed.full_name);
  maybeFill("email", cand.email, parsed.email);
  maybeFill("phone", cand.phone, parsed.phone);
  maybeFill("linkedin_url", cand.linkedin_url, parsed.linkedin_url);

  const { error: updErr } = await db
    .from("candidates")
    .update(patch)
    .eq("id", input.candidateId);
  if (updErr) {
    return { ok: false, error: updErr.message.slice(0, 300) };
  }
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true, data: { parsed } };
}

export async function getResumeSignedUrlAction(
  candidateId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { data } = await hiring()
    .from("candidates")
    .select("resume_url")
    .eq("id", candidateId)
    .maybeSingle();
  const path = (data?.resume_url as string | null) ?? null;
  if (!path) return { ok: false, error: "No resume on file" };
  const { data: signed, error } = await getSupabaseAdmin()
    .storage.from(RESUME_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !signed?.signedUrl) {
    return {
      ok: false,
      error: error?.message?.slice(0, 300) || "Failed to sign URL",
    };
  }
  return { ok: true, url: signed.signedUrl };
}

// ============================================================
// Tags
// ============================================================

const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#94a3b8",
];

function pickTagColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export async function listTagsAction(): Promise<
  | { ok: true; data: Array<{ id: string; name: string; color: string | null }> }
  | { ok: false; error: string }
> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const { data, error } = await hiring()
    .from("tags")
    .select("id, name, color")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return {
    ok: true,
    data: (data ?? []) as Array<{
      id: string;
      name: string;
      color: string | null;
    }>,
  };
}

export async function createTagAction(
  name: string,
): Promise<ActionResult<{ tagId: string; name: string; color: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Tag name is required" };

  const workspaceId = await getRequestWorkspaceId();
  const db = hiring();
  // Dedupe by lowercase name within the workspace.
  const { data: existing } = await db
    .from("tags")
    .select("id, name, color")
    .eq("workspace_id", workspaceId)
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      data: {
        tagId: existing.id as string,
        name: existing.name as string,
        color: (existing.color as string) ?? pickTagColor(trimmed),
      },
    };
  }

  const color = pickTagColor(trimmed);
  const { data, error } = await db
    .from("tags")
    .insert({ workspace_id: workspaceId, name: trimmed, color })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || "Failed to create tag",
    };
  }
  return {
    ok: true,
    data: { tagId: data.id as string, name: trimmed, color },
  };
}

export async function applyTagAction(input: {
  tagId: string;
  entityType: "candidate" | "application" | "role" | "company" | "contact" | "deal";
  entityId: string;
  revalidate?: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  // INSERT … ON CONFLICT DO NOTHING via upsert (composite PK handles dedupe).
  const { error } = await hiring()
    .from("entity_tags")
    .upsert(
      {
        workspace_id: workspaceId,
        tag_id: input.tagId,
        entity_type: input.entityType,
        entity_id: input.entityId,
      },
      { onConflict: "tag_id,entity_type,entity_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true };
}

export async function removeTagAction(input: {
  tagId: string;
  entityType: "candidate" | "application" | "role" | "company" | "contact" | "deal";
  entityId: string;
  revalidate?: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { error } = await hiring()
    .from("entity_tags")
    .delete()
    .eq("tag_id", input.tagId)
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true };
}

export async function createNoteAction(input: {
  entityType: "candidate" | "application" | "role" | "company" | "contact" | "deal";
  entityId: string;
  body: string;
  // Optional: revalidate this path after insert.
  revalidate?: string;
}): Promise<ActionResult<{ noteId: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note cannot be empty" };
  const workspaceId = await getRequestWorkspaceId();
  const { data, error } = await hiring()
    .from("notes")
    .insert({
      workspace_id: workspaceId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      body,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || "Failed to create note",
    };
  }
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true, data: { noteId: data.id as string } };
}

export async function deleteNoteAction(input: {
  noteId: string;
  revalidate?: string;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { error } = await hiring()
    .from("notes")
    .delete()
    .eq("id", input.noteId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (input.revalidate) revalidatePath(input.revalidate);
  return { ok: true };
}

export async function createRoleAndRedirect(formData: FormData) {
  "use server";
  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) {
    redirect(
      `/jobs/new?error=${encodeURIComponent("Pick a company")}`,
    );
  }
  const result = await createRoleAction({
    companyId,
    clientContactEmail:
      (formData.get("contact_email") as string) || undefined,
    clientContactName: (formData.get("contact_name") as string) || undefined,
    title: String(formData.get("title") ?? ""),
    publicDescription:
      (formData.get("public_description") as string) || undefined,
    location: (formData.get("location") as string) || undefined,
    locationLat: formData.get("location_lat")
      ? Number(formData.get("location_lat"))
      : undefined,
    locationLng: formData.get("location_lng")
      ? Number(formData.get("location_lng"))
      : undefined,
    locationPlaceId:
      (formData.get("location_place_id") as string) || undefined,
    salaryMin: formData.get("salary_min")
      ? Number(formData.get("salary_min"))
      : undefined,
    salaryMax: formData.get("salary_max")
      ? Number(formData.get("salary_max"))
      : undefined,
  });
  if (!result.ok) {
    redirect(`/jobs/new?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/jobs/${result.data.roleId}`);
}
