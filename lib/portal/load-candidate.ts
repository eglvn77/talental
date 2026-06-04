import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  ApplicationRow,
  CandidateRow,
  CustomFieldDefinitionRow,
  JobClientPortalSettingsRow,
  PipelineStageRow,
  PortalCommentRow,
} from "@/lib/hiring";
import {
  PORTAL_FIXED_FIELDS,
  PORTAL_TOGGLEABLE_FIELDS,
  effectiveToggle,
} from "./visible-fields";

export type PortalCandidateView = {
  candidate: Partial<CandidateRow> & { id: string };
  application: ApplicationRow;
  stage: PipelineStageRow | null;
  customFields: Array<{ key: string; label: string; value: unknown }>;
  comments: PortalCommentRow[];
  experience: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  settings: JobClientPortalSettingsRow | null;
};

/**
 * Build the portal-safe payload for one candidate. Returns null when:
 * - The application is gone, or
 * - Its stage is not flagged client_portal_visible (=== hidden from
 *   the portal user — they shouldn't be able to deep-link past the
 *   visibility filter), or
 * - The application doesn't belong to a job the token grants access to.
 *
 * Caller is responsible for the token→job authorization. This function
 * trusts the {jobId, candidateId, applicationId} tuple but enforces
 * the stage-visibility gate itself.
 */
export async function loadPortalCandidate(input: {
  candidateId: string;
  applicationId: string;
  jobId: string;
  workspaceId: string;
}): Promise<PortalCandidateView | null> {
  const sb = getSupabaseAdmin();
  const db = sb.schema("hiring");

  const [
    { data: rawCand },
    { data: application },
    { data: settings },
  ] = await Promise.all([
    db.from("candidates").select("*").eq("id", input.candidateId).maybeSingle(),
    db
      .from("applications")
      .select("*")
      .eq("id", input.applicationId)
      .eq("job_id", input.jobId)
      .eq("candidate_id", input.candidateId)
      .maybeSingle(),
    db
      .from("job_client_portal_settings")
      .select("*")
      .eq("job_id", input.jobId)
      .maybeSingle(),
  ]);
  if (!rawCand || !application) return null;
  const app = application as ApplicationRow;
  const set = (settings as JobClientPortalSettingsRow | null) ?? null;

  const { data: stage } = app.stage_id
    ? await db
        .from("pipeline_stages")
        .select("*")
        .eq("id", app.stage_id)
        .maybeSingle()
    : { data: null };
  if (!stage || !(stage as PipelineStageRow).client_portal_visible) {
    return null;
  }

  // Project candidate row to the portal whitelist.
  const candidate: Partial<CandidateRow> & { id: string } = { id: rawCand.id as string };
  for (const k of PORTAL_FIXED_FIELDS) {
    if (k in rawCand) (candidate as Record<string, unknown>)[k] = (rawCand as Record<string, unknown>)[k];
  }
  for (const [field, toggle] of Object.entries(PORTAL_TOGGLEABLE_FIELDS)) {
    const enabled = effectiveToggle(
      set as Record<string, unknown> | null,
      toggle as Parameters<typeof effectiveToggle>[1],
    );
    if (enabled && field in rawCand) {
      (candidate as Record<string, unknown>)[field] = (rawCand as Record<string, unknown>)[field];
    }
  }

  // Portal-visible custom field definitions + values for this candidate.
  const { data: defsRaw } = await db
    .from("custom_field_definitions")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("entity_type", "candidate")
    .eq("is_visible_in_portal", true)
    .order("position", { ascending: true });
  const defs = (defsRaw ?? []) as CustomFieldDefinitionRow[];
  let customFields: Array<{ key: string; label: string; value: unknown }> = [];
  if (defs.length > 0) {
    const { data: values } = await db
      .from("custom_field_values")
      .select("definition_id, value")
      .eq("entity_id", input.candidateId)
      .in("definition_id", defs.map((d) => d.id));
    const byDef = new Map<string, unknown>();
    for (const v of (values ?? []) as Array<{ definition_id: string; value: unknown }>) {
      byDef.set(v.definition_id, v.value);
    }
    customFields = defs
      .map((d) => ({ key: d.key, label: d.label, value: byDef.get(d.id) }))
      .filter((c) => c.value != null && c.value !== "");
  }

  // Experience + education. Primary source is the materialized
  // candidate_experience / candidate_education tables. When those
  // are empty (most DfB2B-enriched candidates are in this state
  // today — the enricher stored parsed_profile.experience but never
  // exploded it into rows), fall back to parsed_profile so the
  // portal still has something to show. The shapes differ slightly;
  // mapParsedExperience / mapParsedEducation normalize them to the
  // same fields the UI reads.
  const [{ data: experienceRows }, { data: educationRows }] = await Promise.all([
    db
      .from("candidate_experience")
      .select("*")
      .eq("candidate_id", input.candidateId)
      .order("position_idx", { ascending: true }),
    db
      .from("candidate_education")
      .select("*")
      .eq("candidate_id", input.candidateId)
      .order("position_idx", { ascending: true }),
  ]);
  let experience = (experienceRows ?? []) as Array<Record<string, unknown>>;
  let education = (educationRows ?? []) as Array<Record<string, unknown>>;
  if (experience.length === 0 || education.length === 0) {
    const pp = (rawCand as { parsed_profile?: Record<string, unknown> })
      .parsed_profile;
    if (experience.length === 0 && pp) {
      experience = mapParsedExperience(pp);
    }
    if (education.length === 0 && pp) {
      education = mapParsedEducation(pp);
    }
  }

  // Comments on this application — visible to every portal viewer
  // sharing access.
  const { data: comments } = await db
    .from("portal_comments")
    .select("*")
    .eq("application_id", input.applicationId)
    .order("created_at", { ascending: true });

  return {
    candidate,
    application: app,
    stage: stage as PipelineStageRow,
    customFields,
    comments: (comments ?? []) as PortalCommentRow[],
    experience,
    education,
    settings: set,
  };
}

/**
 * DfB2B parsed_profile.experience entries look like:
 *   { title, company, location, start_date, end_date, is_current,
 *     description, duration_months, company_logo_url }
 * Normalize to the candidate_experience row shape the portal UI reads
 * (company_name + position).
 */
function mapParsedExperience(
  pp: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const arr = (pp.experience ?? pp.work_experience) as unknown;
  if (!Array.isArray(arr)) return [];
  return arr.map((raw, i) => {
    const e = raw as Record<string, unknown>;
    return {
      id: `pp-exp-${i}`,
      position: e.title ?? e.position ?? null,
      company_name: e.company ?? e.company_name ?? null,
      location: e.location ?? null,
      start_date: e.start_date ?? null,
      end_date: e.end_date ?? null,
      is_current: Boolean(e.is_current),
      description: e.description ?? null,
      duration_months: e.duration_months ?? null,
    };
  });
}

/**
 * DfB2B parsed_profile.education entries: { school, degree,
 * field_of_study, start_date, end_date, school_logo_url }.
 * Already matches candidate_education shape — just pass through with
 * a stable id.
 */
function mapParsedEducation(
  pp: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const arr = pp.education as unknown;
  if (!Array.isArray(arr)) return [];
  return arr.map((raw, i) => {
    const e = raw as Record<string, unknown>;
    return {
      id: `pp-edu-${i}`,
      school: e.school ?? null,
      degree: e.degree ?? null,
      field_of_study: e.field_of_study ?? null,
      start_date: e.start_date ?? null,
      end_date: e.end_date ?? null,
      school_logo_url: e.school_logo_url ?? null,
    };
  });
}
