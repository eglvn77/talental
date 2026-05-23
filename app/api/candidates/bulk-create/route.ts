import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth/session";
import { getRequestWorkspaceId, hiring } from "@/lib/hiring";
import {
  ParsedCvSchema,
  type ParsedCvExperience,
  type ParsedCvEducation,
} from "@/lib/cv-parser/types";

/**
 * POST /api/candidates/bulk-create
 *
 * Receives an array of parsed-CV cards (post-edit) and persists each
 * one into hiring.candidates + hiring.candidate_experience +
 * hiring.candidate_education depending on its action:
 *
 *   create / create_new  → INSERT a new candidate + child rows
 *   update               → UPDATE the existing candidate row
 *                          (per dedup match) + REPLACE its experience
 *                          + education child rows
 *   skip                 → ignored
 *
 * Every persisted row gets:
 *   enrichment_source = 'cv_parse_gemini'
 *   enrichment_status = 'parsed'
 *   needs_embedding   = true  (for the Voyage backfill when ready)
 *
 * The response returns the list of resulting candidate ids so the
 * UI can navigate to /candidates with a recently-added filter.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CardActionSchema = z.enum(["create", "update", "create_new", "skip"]);

const RequestSchema = z
  .object({
    cards: z
      .array(
        z
          .object({
            id: z.string().min(1),
            file_name: z.string().max(300),
            parsed: ParsedCvSchema,
            action: CardActionSchema,
            existing_candidate_id: z.string().uuid().optional().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

const MODEL_TAG = "gemini-2.5-flash";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let workspaceId: string;
  try {
    workspaceId = await getRequestWorkspaceId();
  } catch {
    return NextResponse.json(
      { error: "No workspace in session" },
      { status: 403 },
    );
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    const raw = await req.json();
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: `Validation failed at ${first?.path.join(".") || "(root)"}: ${first?.message ?? "unknown"}`,
        },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = await hiring();

  type ResultItem =
    | {
        card_id: string;
        outcome: "created" | "updated";
        candidate_id: string;
        full_name: string;
      }
    | { card_id: string; outcome: "skipped"; reason?: string }
    | { card_id: string; outcome: "error"; error: string };

  const results: ResultItem[] = [];

  for (const card of body.cards) {
    if (card.action === "skip") {
      results.push({ card_id: card.id, outcome: "skipped" });
      continue;
    }

    try {
      const candidatePayload = candidateFromParsed({
        workspaceId,
        card,
      });

      let candidateId: string;
      let outcome: "created" | "updated";

      if (card.action === "update" && card.existing_candidate_id) {
        const { data, error } = await db
          .from("candidates")
          .update(candidatePayload)
          .eq("id", card.existing_candidate_id)
          .eq("workspace_id", workspaceId)
          .select("id, full_name")
          .single();
        if (error || !data) {
          throw new Error(error?.message ?? "Update returned no row");
        }
        candidateId = data.id as string;
        outcome = "updated";

        // Replace child rows so the new parse fully reflects the
        // candidate's current shape (no orphan stale entries).
        await db.from("candidate_experience").delete().eq("candidate_id", candidateId);
        await db.from("candidate_education").delete().eq("candidate_id", candidateId);
      } else {
        // create or create_new: always INSERT.
        const { data, error } = await db
          .from("candidates")
          .insert(candidatePayload)
          .select("id, full_name")
          .single();
        if (error || !data) {
          throw new Error(error?.message ?? "Insert returned no row");
        }
        candidateId = data.id as string;
        outcome = "created";
      }

      // Insert experience rows.
      const expRows = experienceRowsFromParsed({
        workspaceId,
        candidateId,
        entries: card.parsed.experience,
      });
      if (expRows.length > 0) {
        const { error: expErr } = await db
          .from("candidate_experience")
          .insert(expRows);
        if (expErr) {
          // Don't roll back the candidate — children are best-effort.
          // Log to stderr so the route response can include the warning.
          console.error("[bulk-create] experience insert failed:", expErr.message);
        }
      }

      // Insert education rows.
      const eduRows = educationRowsFromParsed({
        workspaceId,
        candidateId,
        entries: card.parsed.education,
      });
      if (eduRows.length > 0) {
        const { error: eduErr } = await db
          .from("candidate_education")
          .insert(eduRows);
        if (eduErr) {
          console.error("[bulk-create] education insert failed:", eduErr.message);
        }
      }

      results.push({
        card_id: card.id,
        outcome,
        candidate_id: candidateId,
        full_name: (candidatePayload.full_name as string) || card.parsed.full_name,
      });
    } catch (e) {
      results.push({
        card_id: card.id,
        outcome: "error",
        error: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
    }
  }

  const created = results.filter((r) => r.outcome === "created").length;
  const updated = results.filter((r) => r.outcome === "updated").length;
  const skipped = results.filter((r) => r.outcome === "skipped").length;
  const errors = results.filter((r) => r.outcome === "error").length;

  return NextResponse.json({
    ok: true,
    summary: { created, updated, skipped, errors },
    results,
  });
}

// =========================================================
// Mappers
// =========================================================

function candidateFromParsed(input: {
  workspaceId: string;
  card: {
    parsed: z.infer<typeof ParsedCvSchema>;
    file_name: string;
  };
}): Record<string, unknown> {
  const p = input.card.parsed;
  const now = new Date().toISOString();

  // Pull the current role for denormalized convenience columns when
  // the model didn't set current_company / current_position explicitly.
  const currentExp =
    p.experience.find(
      (e) => e.end_date === "present" || e.end_date == null,
    ) ?? p.experience[0];

  return {
    workspace_id: input.workspaceId,
    full_name: p.full_name.slice(0, 200),
    first_name: splitName(p.full_name).first,
    last_name: splitName(p.full_name).last,
    email: p.email?.toLowerCase() ?? null,
    phone: p.phone ?? null,
    linkedin_url: p.linkedin_url ?? null,
    headline: p.headline ?? null,
    summary: p.summary ?? null,
    location: p.location ?? null,
    current_company_name:
      p.current_company ?? currentExp?.company ?? null,
    current_position: p.current_position ?? currentExp?.position ?? null,
    years_of_experience: p.total_years_experience ?? null,
    default_source: "other" as const,
    parsed_profile: toParsedProfileShape(p, input.card.file_name),
    enriched_at: now,
    enrichment_source: "cv_parse_gemini",
    enrichment_status: "parsed",
    data_version: 1,
    needs_embedding: true,
  };
}

function experienceRowsFromParsed(input: {
  workspaceId: string;
  candidateId: string;
  entries: ParsedCvExperience[];
}): Array<Record<string, unknown>> {
  return input.entries.map((e, idx) => ({
    workspace_id: input.workspaceId,
    candidate_id: input.candidateId,
    company_name: e.company.slice(0, 200),
    position: e.position ?? null,
    location: e.location ?? null,
    start_date: parseDate(e.start_date),
    end_date: e.end_date === "present" ? null : parseDate(e.end_date),
    is_current: e.end_date === "present",
    description: e.description ?? null,
    duration_months: computeDurationMonths(e.start_date, e.end_date),
    position_idx: idx,
    enriched_at: new Date().toISOString(),
  }));
}

function educationRowsFromParsed(input: {
  workspaceId: string;
  candidateId: string;
  entries: ParsedCvEducation[];
}): Array<Record<string, unknown>> {
  return input.entries.map((e, idx) => ({
    workspace_id: input.workspaceId,
    candidate_id: input.candidateId,
    school: e.school.slice(0, 200),
    degree: e.degree ?? null,
    field_of_study: e.field ?? null,
    start_date: parseDate(e.start_date),
    end_date: parseDate(e.end_date),
    position_idx: idx,
    enriched_at: new Date().toISOString(),
  }));
}

// =========================================================
// Adapters between ParsedCv and the existing ParsedProfile jsonb
// the slideover reads from.
// =========================================================

function toParsedProfileShape(
  p: z.infer<typeof ParsedCvSchema>,
  fileName: string,
): Record<string, unknown> {
  return {
    full_name: p.full_name,
    email: p.email ?? undefined,
    phone: p.phone ?? undefined,
    linkedin_url: p.linkedin_url ?? undefined,
    location: p.location ?? undefined,
    current_title: p.current_position ?? undefined,
    current_company: p.current_company ?? undefined,
    summary: p.summary ?? undefined,
    experience: p.experience.map((e) => ({
      company: e.company,
      title: e.position ?? "",
      start_date: e.start_date ?? undefined,
      end_date: e.end_date === "present" ? undefined : (e.end_date ?? undefined),
      is_current: e.end_date === "present",
      location: e.location ?? undefined,
      description: e.description ?? undefined,
    })),
    education: p.education.map((e) => ({
      school: e.school,
      degree: e.degree ?? undefined,
      field: e.field ?? undefined,
      start_year: yearOnly(e.start_date),
      end_year: yearOnly(e.end_date),
    })),
    skills: p.skills,
    languages: p.languages,
    _source: {
      kind: "cv_parse_gemini",
      file_name: fileName,
      model: MODEL_TAG,
      parsed_at: new Date().toISOString(),
    },
  };
}

// =========================================================
// Tiny helpers
// =========================================================

function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts[parts.length - 1],
  };
}

/** Convert "YYYY", "YYYY-MM", "YYYY-MM-DD" → ISO date or null. */
function parseDate(s: string | null | undefined): string | null {
  if (!s || s === "present") return null;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function yearOnly(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})/.exec(s);
  return m ? m[1] : undefined;
}

function computeDurationMonths(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start) return null;
  const s = parseDate(start);
  if (!s) return null;
  const e = end === "present" || !end ? new Date() : parseDate(end);
  if (!e) return null;
  const startDate = new Date(s);
  const endDate = typeof e === "string" ? new Date(e) : e;
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  const months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());
  return Math.max(0, months);
}
