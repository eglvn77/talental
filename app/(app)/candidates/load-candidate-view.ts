import "server-only";

import { hiring } from "@/lib/hiring";
import { loadCustomFieldsForEntity, type CustomFieldBundle } from "@/lib/custom-fields";
import type { ParsedProfile } from "@/lib/resume-parse";
import {
  loadCandidateProfile,
  type CandidateProfileBundle,
} from "./load-candidate-profile";
import type { ActivityEvent } from "./candidate-activity";
import type { AddToJobOption } from "./add-to-job-dialog";

/**
 * Everything the candidate profile view (full page OR slideover panel)
 * needs, loaded once. Returns null when the candidate isn't visible to
 * the workspace — caller decides 404 vs silent no-op.
 */
export type CandidateView = {
  bundle: CandidateProfileBundle;
  customFields: CustomFieldBundle;
  activityEvents: ActivityEvent[];
  addToJobOptions: AddToJobOption[];
  activeStage: { name: string; color: string | null } | null;
  profile: ParsedProfile | null;
};

export async function loadCandidateView(
  id: string,
): Promise<CandidateView | null> {
  const bundle = await loadCandidateProfile(id);
  if (!bundle) return null;

  const db = await hiring();
  const [customFields, { data: jobRows }] = await Promise.all([
    loadCustomFieldsForEntity("candidate", id),
    db
      .from("jobs")
      .select("id, title, status:job_statuses(is_open)")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  type JobRow = {
    id: string;
    title: string;
    status: { is_open: boolean } | { is_open: boolean }[] | null;
  };
  const linkedJobIds = new Set(bundle.applications.map((a) => a.job_id));
  const addToJobOptions: AddToJobOption[] = ((jobRows ?? []) as JobRow[])
    .filter((j) => {
      const s = Array.isArray(j.status) ? j.status[0] : j.status;
      return s?.is_open === true;
    })
    .map((j) => ({ id: j.id, title: j.title, linked: linkedJobIds.has(j.id) }));

  // Activity feed: pipeline events across every application, with stage
  // names + job titles resolved for display.
  const appIds = bundle.applications.map((a) => a.id);
  const jobIds = Array.from(new Set(bundle.applications.map((a) => a.job_id)));
  const jobTitleByAppId = new Map(
    bundle.applications.map((a) => [a.id, a.job?.title ?? null]),
  );
  const [{ data: eventRows }, { data: stageRows }] = await Promise.all([
    appIds.length
      ? db
          .from("application_events")
          .select("id, application_id, event_type, payload, actor, created_at")
          .in("application_id", appIds)
          .order("created_at", { ascending: false })
          .limit(150)
      : Promise.resolve({ data: [] as never[] }),
    jobIds.length
      ? db.from("pipeline_stages").select("id, name").in("job_id", jobIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const stageNameById = new Map(
    ((stageRows ?? []) as { id: string; name: string }[]).map((s) => [
      s.id,
      s.name,
    ]),
  );
  const activityEvents: ActivityEvent[] = (
    (eventRows ?? []) as {
      id: number;
      application_id: string;
      event_type: string;
      payload: { from_stage_id?: string; to_stage_id?: string } | null;
      actor: string | null;
      created_at: string;
    }[]
  ).map((e) => ({
    id: String(e.id),
    created_at: e.created_at,
    event_type: e.event_type,
    actor: e.actor,
    jobTitle: jobTitleByAppId.get(e.application_id) ?? null,
    fromStage: e.payload?.from_stage_id
      ? stageNameById.get(e.payload.from_stage_id) ?? null
      : null,
    toStage: e.payload?.to_stage_id
      ? stageNameById.get(e.payload.to_stage_id) ?? null
      : null,
  }));

  const profile = bundle.candidate.parsed_profile as ParsedProfile | null;
  const activeStage = bundle.applications[0]?.stage
    ? {
        name: bundle.applications[0].stage!.name,
        color: bundle.applications[0].stage!.color,
      }
    : null;

  return {
    bundle,
    customFields,
    activityEvents,
    addToJobOptions,
    activeStage,
    profile,
  };
}
