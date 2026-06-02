import {
  hiring,
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { JobsView } from "./jobs-view";
import { loadCandidateView } from "@/app/(app)/candidates/load-candidate-view";
import { CandidateSlideoverShell } from "@/app/(app)/candidates/candidate-slideover-shell";
import {
  CandidateProfileView,
  parseTab,
} from "@/app/(app)/candidates/candidate-profile-view";

export const dynamic = "force-dynamic";

export default async function TrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{
    contact?: string;
    candidate?: string;
    app?: string;
    tab?: string;
  }>;
}) {
  const { jobId: jobId } = await params;
  const sp = await searchParams;
  const db = await hiring();
  const t = await getT();

  const [{ data: stagesData }, { data: appsData }, { data: jobData }] =
    await Promise.all([
      db
        .from("pipeline_stages")
        .select("*")
        .eq("job_id", jobId)
        .order("position", { ascending: true }),
      db
        .from("applications")
        .select("*")
        .eq("job_id", jobId)
        .order("applied_at", { ascending: false }),
      db.from("jobs").select("work_modality").eq("id", jobId).maybeSingle(),
    ]);
  const stages = (stagesData ?? []) as PipelineStageRow[];
  const apps = (appsData ?? []) as ApplicationRow[];
  const workModality = (jobData?.work_modality as
    | "remote"
    | "hybrid"
    | "onsite"
    | null
    | undefined) ?? null;

  const candidatesById: Record<string, CandidateRow> = {};
  if (apps.length > 0) {
    const { data: cands } = await db
      .from("candidates")
      .select("*")
      .in(
        "id",
        apps.map((a) => a.candidate_id),
      );
    for (const c of (cands ?? []) as CandidateRow[]) {
      candidatesById[c.id] = c;
    }
  }

  const stagesById: Record<string, PipelineStageRow> = {};
  for (const s of stages) stagesById[s.id] = s;

  // Fetch tags for every application on this board.
  const tagsByApplicationId: Record<string, TagRow[]> = {};
  if (apps.length > 0) {
    const { data: links } = await db
      .from("entity_tags")
      .select("entity_id, tag_id")
      .eq("entity_type", "application")
      .in(
        "entity_id",
        apps.map((a) => a.id),
      );
    const tagIds = Array.from(
      new Set((links ?? []).map((l) => l.tag_id as string)),
    );
    if (tagIds.length > 0) {
      const { data: tagRows } = await db
        .from("tags")
        .select("*")
        .in("id", tagIds);
      const tagsById = new Map<string, TagRow>();
      for (const t of (tagRows ?? []) as TagRow[]) tagsById.set(t.id, t);
      for (const link of (links ?? []) as Array<{
        entity_id: string;
        tag_id: string;
      }>) {
        const tag = tagsById.get(link.tag_id);
        if (!tag) continue;
        (tagsByApplicationId[link.entity_id] ??= []).push(tag);
      }
    }
  }

  // Unified candidate profile panel. ?candidate=<id> is canonical;
  // ?contact=<appId> (legacy links) resolves the candidate from the
  // application and focuses it. Same panel as /candidates — one view
  // everywhere, overlaying the board without changing route.
  let panelCandidateId: string | null = null;
  let panelFocusAppId: string | null = null;
  if (sp.candidate) {
    panelCandidateId = sp.candidate;
    panelFocusAppId = sp.app ?? null;
  } else if (sp.contact) {
    const app = apps.find((a) => a.id === sp.contact) ?? null;
    if (app) {
      panelCandidateId = app.candidate_id as string;
      panelFocusAppId = app.id;
    }
  }

  // Mark the focused application reviewed the moment its panel opens.
  // Drives the macOS-style red-dot badge on /jobs. Non-fatal.
  if (panelFocusAppId) {
    await db
      .from("applications")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("id", panelFocusAppId)
      .is("reviewed_at", null);
  }

  const panelView = panelCandidateId
    ? await loadCandidateView(panelCandidateId, panelFocusAppId)
    : null;
  const me = await getCurrentUser();
  const userIsAdmin = me ? isAdmin(me.team_member) : false;
  const panelTab = parseTab(sp.tab);

  return (
    <>
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-xs text-muted-foreground">
          {apps.length}{" "}
          {apps.length === 1
            ? t("jobDetail.candidateSingular")
            : t("jobDetail.candidatePlural")}{" "}
          · {t("jobDetail.stagesCount", { count: stages.length })}
        </span>
      </div>

      {stages.length === 0 ? (
        <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("jobDetail.noStagesConfigured")}
        </p>
      ) : (
        <JobsView
          jobId={jobId}
          stages={stages}
          applications={apps}
          candidatesById={candidatesById}
          tagsByApplicationId={tagsByApplicationId}
          workModality={workModality}
        />
      )}

      {panelView ? (
        <CandidateSlideoverShell
          candidateName={panelView.bundle.candidate.full_name}
        >
          <CandidateProfileView
            view={panelView}
            tab={panelTab}
            mode="panel"
            isAdmin={userIsAdmin}
            mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
            t={t}
          />
        </CandidateSlideoverShell>
      ) : null}
    </>
  );
}
