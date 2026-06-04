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
import type {
  ParsedEducation,
  ParsedExperience,
  ParsedProfile,
} from "@/lib/resume-parse";
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
  /** Unified resume shape — recycled from the internal candidate
   *  detail view so the portal layout matches the recruiter's view
   *  byte-for-byte (tenure stats, logos, "Show more" collapses). */
  profile: ParsedProfile;
  settings: JobClientPortalSettingsRow | null;
};

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

  // Project candidate row to the portal whitelist with documented
  // defaults — never undefined for known toggle keys.
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

  // Portal-visible custom field definitions + values.
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

  // Build unified ParsedProfile — primary source is the materialized
  // child tables, fallback is parsed_profile jsonb (DfB2B blob).
  const profile = await buildParsedProfile(db, input.candidateId, rawCand);

  // Comments on this application.
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
    profile,
    settings: set,
  };
}

async function buildParsedProfile(
  db: ReturnType<ReturnType<typeof getSupabaseAdmin>["schema"]>,
  candidateId: string,
  rawCand: Record<string, unknown>,
): Promise<ParsedProfile> {
  const [{ data: expRows }, { data: eduRows }] = await Promise.all([
    db
      .from("candidate_experience")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("position_idx", { ascending: true }),
    db
      .from("candidate_education")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("position_idx", { ascending: true }),
  ]);

  let experience: ParsedExperience[] = (expRows ?? []).map(rowToParsedExperience);
  let education: ParsedEducation[] = (eduRows ?? []).map(rowToParsedEducation);

  if (experience.length === 0 || education.length === 0) {
    const pp = rawCand.parsed_profile as Record<string, unknown> | null;
    if (pp) {
      if (experience.length === 0) experience = parsedProfileExperience(pp);
      if (education.length === 0) education = parsedProfileEducation(pp);
    }
  }

  return {
    summary: (rawCand.summary as string | null) ?? undefined,
    experience,
    education,
    skills: [],
    languages: [],
  };
}

function rowToParsedExperience(r: Record<string, unknown>): ParsedExperience {
  return {
    company: (r.company_name as string) ?? "",
    title: (r.position as string) ?? "",
    start_date: (r.start_date as string) ?? undefined,
    end_date: (r.end_date as string) ?? undefined,
    location: (r.location as string) ?? undefined,
    description: (r.description as string) ?? undefined,
    is_current: Boolean(r.is_current),
    duration_months: (r.duration_months as number) ?? undefined,
  };
}

function rowToParsedEducation(r: Record<string, unknown>): ParsedEducation {
  return {
    school: (r.school as string) ?? "",
    degree: (r.degree as string) ?? undefined,
    field: (r.field_of_study as string) ?? undefined,
    start_year: (r.start_date as string) ?? undefined,
    end_year: (r.end_date as string) ?? undefined,
    school_logo_url: (r.school_logo_url as string) ?? undefined,
  };
}

function parsedProfileExperience(
  pp: Record<string, unknown>,
): ParsedExperience[] {
  const arr = (pp.experience ?? pp.work_experience) as unknown;
  if (!Array.isArray(arr)) return [];
  return arr.map((raw) => {
    const e = raw as Record<string, unknown>;
    return {
      company: (e.company as string) ?? (e.company_name as string) ?? "",
      title: (e.title as string) ?? (e.position as string) ?? "",
      start_date: (e.start_date as string) ?? undefined,
      end_date: (e.end_date as string) ?? undefined,
      location: (e.location as string) ?? undefined,
      description: (e.description as string) ?? undefined,
      company_logo_url: (e.company_logo_url as string) ?? undefined,
      is_current: Boolean(e.is_current),
      duration_months: (e.duration_months as number) ?? undefined,
    };
  });
}

function parsedProfileEducation(
  pp: Record<string, unknown>,
): ParsedEducation[] {
  const arr = pp.education as unknown;
  if (!Array.isArray(arr)) return [];
  return arr.map((raw) => {
    const e = raw as Record<string, unknown>;
    const startYear =
      (e.start_year as string) ?? extractYear(e.start_date as string);
    const endYear =
      (e.end_year as string) ?? extractYear(e.end_date as string);
    return {
      school: (e.school as string) ?? "",
      degree: (e.degree as string) ?? undefined,
      field: (e.field as string) ?? (e.field_of_study as string) ?? undefined,
      start_year: startYear,
      end_year: endYear,
      school_logo_url: (e.school_logo_url as string) ?? undefined,
    };
  });
}

function extractYear(d: string | undefined | null): string | undefined {
  if (!d) return undefined;
  const m = /^\d{4}/.exec(String(d));
  return m ? m[0] : undefined;
}
