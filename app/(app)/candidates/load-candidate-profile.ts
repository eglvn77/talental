import "server-only";

import {
  hiring,
  type CandidateRow,
  type PortalCommentRow,
  type TagRow,
  type SourceRow,
} from "@/lib/hiring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadSources } from "@/lib/sources";
import { loadReferencedCompaniesForCandidate } from "@/lib/sourcing/load-companies";
import type { CompanyChipData } from "@/app/(app)/_components/company-chip";
import type { NoteWithAuthor } from "@/app/(app)/_components/notes-section";
import type { CandidateProfileApp } from "./candidate-profile-body";

/**
 * Load everything the candidate profile body needs in one place:
 *   - the candidate row (workspace-scoped via RLS)
 *   - companies referenced from parsed_profile.experience[].company_id
 *   - applications joined with stage + job
 *
 * Returns null when the candidate doesn't exist or isn't visible to
 * the current workspace. Caller decides whether that's a 404 (page
 * route) or a silent no-op (slideover param).
 */
export type CandidateProfileBundle = {
  candidate: CandidateRow;
  companiesById: Record<string, CompanyChipData>;
  applications: CandidateProfileApp[];
  notes: NoteWithAuthor[];
  /** Candidate-level tags (entity_type='candidate') — distinct from
   *  the per-application tags shown inside a vacante's pipeline. */
  tags: TagRow[];
  /** Candidate-scope Source/Origen options for the inline dropdown. */
  sources: SourceRow[];
  /** Comments and 👍/👎 reactions left by client-portal viewers
   *  across any of this candidate's applications. */
  portalComments: Array<
    PortalCommentRow & { job_title: string | null }
  >;
  /** Interview transcripts (Granola / manual) tied to this candidate
   *  across all their applications. Grouped by application_id in the
   *  UI; unlinked ones (application_id NULL) get an inbox tray. */
  transcripts: Array<{
    id: string;
    application_id: string | null;
    source: "granola" | "manual" | "upload";
    title: string | null;
    recorded_at: string | null;
    created_at: string;
  }>;
};

export async function loadCandidateProfile(
  id: string,
): Promise<CandidateProfileBundle | null> {
  const db = await hiring();
  const { data: candidateData } = await db
    .from("candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!candidateData) return null;
  const candidate = candidateData as CandidateRow;

  // Opening a candidate's profile counts as reviewing every pending
  // application they have. Idempotent (partial index filters
  // unreviewed rows) and scoped by RLS to the recruiter's workspace.
  // Non-fatal; we don't want a hiccup here to 500 the profile load.
  await db
    .from("applications")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("candidate_id", id)
    .is("reviewed_at", null);

  // Fan out the five independent reads. Each was previously awaited
  // serially, costing ~4 extra round-trips on every profile open.
  const [
    companiesById,
    { data: applicationsData },
    { data: notesData },
    { data: tagLinks },
    sources,
  ] = await Promise.all([
    loadReferencedCompaniesForCandidate(candidate),
    db
      .from("applications")
      .select(
        `
        id, job_id, applied_at, status_changed_at, category,
        source, source_meta,
        ai_status_line, ai_next_steps, ai_context_updated_at,
        candidate_report, report_generated_at, report_model,
        report_inputs, report_edited_at, rating,
        stage:pipeline_stages(id, name, color),
        job:jobs(id, title)
        `,
      )
      .eq("candidate_id", id)
      .order("applied_at", { ascending: false }),
    db
      .from("notes")
      .select(
        "*, author:team_members!notes_author_id_fkey(full_name, avatar_url)",
      )
      .eq("entity_type", "candidate")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("entity_tags")
      .select("tag_id")
      .eq("entity_type", "candidate")
      .eq("entity_id", id),
    loadSources("candidate"),
  ]);

  type RawAppRow = {
    id: string;
    job_id: string;
    applied_at: string | null;
    status_changed_at: string | null;
    category: string | null;
    source: string | null;
    source_meta: unknown;
    ai_status_line: string | null;
    ai_next_steps: unknown;
    ai_context_updated_at: string | null;
    candidate_report: string | null;
    report_generated_at: string | null;
    report_model: string | null;
    report_inputs: unknown;
    report_edited_at: string | null;
    rating: number | null;
    stage:
      | { id: string; name: string; color: string | null }
      | Array<{ id: string; name: string; color: string | null }>
      | null;
    job:
      | { id: string; title: string }
      | Array<{ id: string; title: string }>
      | null;
  };
  function unwrap<T>(v: T | T[] | null | undefined): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
  const applications: CandidateProfileApp[] = (
    (applicationsData ?? []) as RawAppRow[]
  ).map((a) => ({
    id: a.id,
    job_id: a.job_id,
    applied_at: a.applied_at,
    status_changed_at: a.status_changed_at,
    category: a.category,
    source: a.source,
    source_meta: a.source_meta,
    ai_status_line: a.ai_status_line,
    ai_next_steps: a.ai_next_steps,
    ai_context_updated_at: a.ai_context_updated_at,
    candidate_report: a.candidate_report,
    report_generated_at: a.report_generated_at,
    report_model: a.report_model,
    report_inputs: a.report_inputs,
    report_edited_at: a.report_edited_at,
    rating: a.rating,
    stage: unwrap(a.stage),
    job: unwrap(a.job),
  }));

  // Notes joined with the author's display name + avatar (see select
  // above) so attribution doesn't need a per-row round-trip.
  const notes = (notesData ?? []) as unknown as NoteWithAuthor[];

  // Candidate-level tags. entity_tags is fetched in the parallel batch
  // above; the tag rows themselves need a follow-up query because we
  // only know the IDs after the link query resolves.
  const tags: TagRow[] = [];
  const tagIds = Array.from(
    new Set((tagLinks ?? []).map((l) => l.tag_id as string)),
  );
  if (tagIds.length > 0) {
    const { data: tagRows } = await db
      .from("tags")
      .select("*")
      .in("id", tagIds);
    tags.push(...((tagRows ?? []) as TagRow[]));
  }

  // Interview transcripts for this candidate (both linked to apps and
  // unlinked). The UI surfaces them grouped by application_id, with
  // unlinked ones in a separate tray for manual assignment.
  type TranscriptListItem = {
    id: string;
    application_id: string | null;
    source: "granola" | "manual" | "upload";
    title: string | null;
    recorded_at: string | null;
    created_at: string;
  };
  const { data: transcriptRows } = await db
    .from("interview_transcripts")
    .select("id, application_id, source, title, recorded_at, created_at")
    .eq("candidate_id", id)
    .order("recorded_at", { ascending: false, nullsFirst: false });
  const transcripts = (transcriptRows ?? []) as TranscriptListItem[];

  // Client-portal comments across all of this candidate's applications.
  // portal_comments is service_role only, so we read via the admin
  // client; the recruiter UI is already auth-gated upstream.
  const portalComments: Array<
    PortalCommentRow & { job_title: string | null }
  > = [];
  if (applications.length > 0) {
    const appIds = applications.map((a) => a.id);
    const admin = getSupabaseAdmin().schema("hiring");
    const { data: commentRows } = await admin
      .from("portal_comments")
      .select("*")
      .in("application_id", appIds)
      .order("created_at", { ascending: false });
    const jobTitleByAppId: Record<string, string | null> = {};
    for (const a of applications) jobTitleByAppId[a.id] = a.job?.title ?? null;
    for (const c of (commentRows ?? []) as PortalCommentRow[]) {
      portalComments.push({
        ...c,
        job_title: jobTitleByAppId[c.application_id] ?? null,
      });
    }
  }

  return {
    candidate,
    companiesById,
    applications,
    notes,
    tags,
    sources,
    portalComments,
    transcripts,
  };
}
