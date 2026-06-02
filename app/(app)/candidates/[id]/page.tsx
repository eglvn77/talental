import { notFound } from "next/navigation";
import { hiring } from "@/lib/hiring";
import { loadCandidateProfile } from "../load-candidate-profile";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import type { ParsedProfile } from "@/lib/resume-parse";
import { CandidateScreen } from "../candidate-screen";
import { CandidateDetalles } from "../candidate-detalles";
import { CandidateActivity, type ActivityEvent } from "../candidate-activity";
import type { AddToJobOption } from "../add-to-job-dialog";

export const dynamic = "force-dynamic";

/**
 * Full-page candidate profile. Opened from the talent-pool table (which
 * stashes the ordered id-list in sessionStorage so the header offers
 * prev/next) and from deep links / shares (no nav context → prev/next
 * stays hidden).
 *
 * Three tabs: Detalles (working surface), Actividad (notes/timeline),
 * Conversaciones (Unipile outreach).
 */
export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await loadCandidateProfile(id);
  if (!bundle) notFound();

  const me = await getCurrentUser();
  const userIsAdmin = me ? isAdmin(me.team_member) : false;
  const t = await getT();
  const revalidatePath = `/candidates/${id}`;

  // Open jobs for the "Add to job" dialog + the candidate's custom-field
  // values. Both are independent of the profile bundle.
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
    .map((j) => ({
      id: j.id,
      title: j.title,
      linked: linkedJobIds.has(j.id),
    }));

  // Activity feed: pipeline events across every application this
  // candidate has, with stage names + job titles resolved for display.
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
          .select("id, name")
          .in("job_id", jobIds)
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

  return (
    <CandidateScreen
      candidateId={bundle.candidate.id}
      fullName={bundle.candidate.full_name}
      headline={bundle.candidate.headline}
      currentTitle={bundle.candidate.current_position}
      currentCompany={bundle.candidate.current_company_name}
      profilePictureUrl={
        bundle.candidate.profile_picture_url ??
        profile?.profile_picture_url ??
        null
      }
      activeStage={activeStage}
      hasResume={Boolean(bundle.candidate.resume_url)}
      addToJobOptions={addToJobOptions}
      detailsSlot={
        <CandidateDetalles
          candidate={bundle.candidate}
          profile={profile}
          companiesById={bundle.companiesById}
          applications={bundle.applications}
          tags={bundle.tags}
          sources={bundle.sources}
          customFields={customFields}
          mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
          revalidatePath={revalidatePath}
          t={t}
        />
      }
      activitySlot={
        <CandidateActivity
          candidateId={bundle.candidate.id}
          notes={bundle.notes}
          events={activityEvents}
          isAdmin={userIsAdmin}
          revalidatePath={revalidatePath}
        />
      }
      conversationsSlot={
        <div className="mx-auto max-w-3xl">
          <div className="rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] px-4 py-10 text-center">
            <p className="text-sm font-medium">{t("candidatesArea.comingSoon")}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {t("candidatesArea.conversationsStubDesc")}
            </p>
          </div>
        </div>
      }
    />
  );
}
