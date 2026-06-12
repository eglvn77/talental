import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  ApplicationRow,
  CandidateRow,
  JobRow,
  JobClientPortalSettingsRow,
  PipelineStageRow,
} from "@/lib/hiring";

export type PortalPipeline = {
  job: JobRow;
  settings: JobClientPortalSettingsRow | null;
  stages: PipelineStageRow[];
  applications: ApplicationRow[];
  candidatesById: Record<string, CandidateRow>;
};

/**
 * Load everything the portal needs to render a job's pipeline. Returns
 * only stages flagged `client_portal_visible` and only applications
 * sitting in one of those stages — categories the recruiter wants
 * hidden never leave the server.
 */
export async function loadPortalPipeline(
  jobId: string,
  workspaceId: string,
): Promise<PortalPipeline | null> {
  const sb = getSupabaseAdmin();
  const db = sb.schema("hiring");

  // Explicit columns only — `job` is serialized into the RSC payload
  // of PortalKanban ('use client'), so anything selected here reaches
  // the anonymous portal visitor's browser. hiring.jobs carries fees,
  // splits and internal_notes; ship only what the pages read
  // (title + company_id) plus display-safe fields.
  const { data: job } = await db
    .from("jobs")
    .select("id, title, company_id, work_modality")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!job) return null;

  const [{ data: settings }, { data: stagesData }] = await Promise.all([
    db
      .from("job_client_portal_settings")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle(),
    db
      .from("pipeline_stages")
      .select("*")
      .eq("job_id", jobId)
      .eq("client_portal_visible", true)
      .order("position", { ascending: true }),
  ]);

  const stages = (stagesData ?? []) as PipelineStageRow[];
  if (stages.length === 0) {
    return {
      job: job as JobRow,
      settings: (settings as JobClientPortalSettingsRow | null) ?? null,
      stages: [],
      applications: [],
      candidatesById: {},
    };
  }

  // Explicit columns — applications row reaches the client. NEVER
  // select("*": that would leak candidate_report (the internal AI
  // write-up), rating, ai_status_line and source_meta (salary
  // expectations + screening answers) to the portal visitor. The
  // kanban only needs the link ids + ordering key.
  const stageIds = stages.map((s) => s.id);
  const { data: appsData } = await db
    .from("applications")
    .select("id, candidate_id, stage_id, status_changed_at")
    .eq("job_id", jobId)
    .in("stage_id", stageIds)
    .order("status_changed_at", { ascending: false });
  const applications = (appsData ?? []) as ApplicationRow[];

  const candidatesById: Record<string, CandidateRow> = {};
  if (applications.length > 0) {
    // Explicit columns — candidate cards only render name + current
    // role + photo. select("*") would ship email, phone, comp_*,
    // linkedin_url, resume_url and parsed_profile to the anonymous
    // client.
    const { data: cands } = await db
      .from("candidates")
      .select(
        "id, full_name, current_position, current_company_name, profile_picture_url",
      )
      .in("id", applications.map((a) => a.candidate_id));
    for (const c of (cands ?? []) as CandidateRow[]) {
      candidatesById[c.id] = c;
    }
  }

  return {
    job: job as JobRow,
    settings: (settings as JobClientPortalSettingsRow | null) ?? null,
    stages,
    applications,
    candidatesById,
  };
}

/**
 * Per-job counts for the company-scope job list. Counts every
 * application in a portal-visible stage, ignoring hidden ones.
 */
export async function loadVisibleAppCounts(
  jobIds: string[],
): Promise<Record<string, number>> {
  if (jobIds.length === 0) return {};
  const sb = getSupabaseAdmin();
  const db = sb.schema("hiring");
  const { data: stages } = await db
    .from("pipeline_stages")
    .select("id, job_id")
    .in("job_id", jobIds)
    .eq("client_portal_visible", true);
  const stageRows = (stages ?? []) as Array<{ id: string; job_id: string }>;
  if (stageRows.length === 0) return {};
  const stageIds = stageRows.map((s) => s.id);
  const { data: apps } = await db
    .from("applications")
    .select("job_id")
    .in("stage_id", stageIds);
  const counts: Record<string, number> = {};
  for (const a of (apps ?? []) as { job_id: string }[]) {
    counts[a.job_id] = (counts[a.job_id] ?? 0) + 1;
  }
  return counts;
}
