import "server-only";

import { hiring, type TagRow } from "@/lib/hiring";
import { loadCustomFieldsForEntity, type CustomFieldBundle } from "@/lib/custom-fields";
import type { ParsedProfile } from "@/lib/resume-parse";
import type { NoteWithAuthor } from "@/app/(app)/_components/notes-section";
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
export type StageOption = { id: string; name: string; color: string | null };

export type CandidateView = {
  bundle: CandidateProfileBundle;
  customFields: CustomFieldBundle;
  activityEvents: ActivityEvent[];
  addToJobOptions: AddToJobOption[];
  activeStage: { name: string; color: string | null } | null;
  profile: ParsedProfile | null;
  /** Pipeline stages for each job the candidate has applied to, ordered
   *  by position — drives the inline stage selector per application. */
  stagesByJobId: Record<string, StageOption[]>;
  /** When opened focused on a specific application (e.g. from a job
   *  pipeline), its application-scoped notes + tags. Null otherwise. */
  focusApp: {
    id: string;
    jobTitle: string | null;
    notes: NoteWithAuthor[];
    tags: TagRow[];
  } | null;
};

export async function loadCandidateView(
  id: string,
  focusAppId?: string | null,
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
      ? db
          .from("pipeline_stages")
          .select("id, name, color, position, job_id")
          .in("job_id", jobIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
  ]);
  type StageRow = {
    id: string;
    name: string;
    color: string | null;
    position: number;
    job_id: string;
  };
  const allStages = (stageRows ?? []) as StageRow[];
  const stageNameById = new Map(allStages.map((s) => [s.id, s.name]));
  const stagesByJobId: Record<string, StageOption[]> = {};
  for (const s of allStages) {
    (stagesByJobId[s.job_id] ??= []).push({
      id: s.id,
      name: s.name,
      color: s.color,
    });
  }
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

  // Focused application (opened from a job pipeline): load its
  // application-scoped notes + tags so the unified profile shows both
  // candidate-level and this-job-level context.
  let focusApp: CandidateView["focusApp"] = null;
  const focusedApplication = focusAppId
    ? bundle.applications.find((a) => a.id === focusAppId) ?? null
    : null;
  if (focusedApplication) {
    const [{ data: notesData }, { data: tagLinks }] = await Promise.all([
      db
        .from("notes")
        .select(
          "*, author:team_members!notes_author_id_fkey(full_name, avatar_url)",
        )
        .eq("entity_type", "application")
        .eq("entity_id", focusedApplication.id)
        .order("created_at", { ascending: false }),
      db
        .from("entity_tags")
        .select("tag_id")
        .eq("entity_type", "application")
        .eq("entity_id", focusedApplication.id),
    ]);
    const tagIds = Array.from(
      new Set((tagLinks ?? []).map((l) => l.tag_id as string)),
    );
    let tags: TagRow[] = [];
    if (tagIds.length > 0) {
      const { data: tagRows } = await db.from("tags").select("*").in("id", tagIds);
      tags = (tagRows ?? []) as TagRow[];
    }
    focusApp = {
      id: focusedApplication.id,
      jobTitle: focusedApplication.job?.title ?? null,
      notes: (notesData ?? []) as unknown as NoteWithAuthor[],
      tags,
    };
  }

  return {
    bundle,
    customFields,
    activityEvents,
    addToJobOptions,
    activeStage,
    profile,
    stagesByJobId,
    focusApp,
  };
}
