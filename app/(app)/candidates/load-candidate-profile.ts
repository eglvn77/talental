import "server-only";

import {
  hiring,
  type CandidateRow,
  type TagRow,
  type SourceRow,
} from "@/lib/hiring";
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

  const companiesById = await loadReferencedCompaniesForCandidate(candidate);

  const { data: applicationsData } = await db
    .from("applications")
    .select(
      `
      id, job_id, applied_at, status_changed_at, category,
      ai_status_line, ai_next_steps, ai_context_updated_at,
      stage:pipeline_stages(id, name, color),
      job:jobs(id, title)
      `,
    )
    .eq("candidate_id", id)
    .order("applied_at", { ascending: false });

  type RawAppRow = {
    id: string;
    job_id: string;
    applied_at: string | null;
    status_changed_at: string | null;
    category: string | null;
    ai_status_line: string | null;
    ai_next_steps: unknown;
    ai_context_updated_at: string | null;
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
    ai_status_line: a.ai_status_line,
    ai_next_steps: a.ai_next_steps,
    ai_context_updated_at: a.ai_context_updated_at,
    stage: unwrap(a.stage),
    job: unwrap(a.job),
  }));

  // Notes attached to the candidate entity (the in-job slideover
  // attaches notes to applications instead — those have their own
  // load path).
  // Notes joined with the author's display name + avatar so the
  // notes section can attribute "who said what" without an extra
  // round-trip per row.
  const { data: notesData } = await db
    .from("notes")
    .select(
      "*, author:team_members!notes_author_id_fkey(full_name, avatar_url)",
    )
    .eq("entity_type", "candidate")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });
  // Cast to NoteWithAuthor — same Note row shape with the joined
  // `author` object (full_name + avatar_url) added by the embed above.
  const notes = (notesData ?? []) as unknown as NoteWithAuthor[];

  // Candidate-level tags. Mirrors the application tag-load pattern:
  // one query for the entity_tags links, one for the tag rows.
  const tags: TagRow[] = [];
  const { data: tagLinks } = await db
    .from("entity_tags")
    .select("tag_id")
    .eq("entity_type", "candidate")
    .eq("entity_id", id);
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

  const sources = await loadSources("candidate");
  return { candidate, companiesById, applications, notes, tags, sources };
}
