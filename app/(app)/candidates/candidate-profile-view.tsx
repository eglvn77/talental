import type { TFunction } from "@/lib/i18n/translate";
import { CandidateHeader, type CandidateTab } from "./candidate-screen";
import { CandidateDetalles } from "./candidate-detalles";
import { CandidateActivity } from "./candidate-activity";
import type { CandidateView } from "./load-candidate-view";

/**
 * The candidate profile content — header (identity, nav, actions, tabs)
 * plus the active tab panel. Shared by the full-page route
 * (/candidates/[id], mode="page") and the slideover panel that overlays
 * the talent-pool table (/candidates?candidate=, mode="panel").
 *
 * In panel mode all navigation is query-param driven so the underlying
 * route never changes — the table stays mounted behind the overlay.
 */
export function CandidateProfileView({
  view,
  tab,
  mode,
  isAdmin,
  mapsApiKey,
  t,
}: {
  view: CandidateView;
  tab: CandidateTab;
  mode: "page" | "panel";
  isAdmin: boolean;
  mapsApiKey: string;
  t: TFunction;
}) {
  const { bundle, customFields, activityEvents, addToJobOptions, activeStage, profile } =
    view;
  // Panel actions revalidate the talent-pool route; page actions the
  // standalone path. Both then router.refresh() client-side.
  const revalidatePath =
    mode === "panel" ? "/candidates" : `/candidates/${bundle.candidate.id}`;

  return (
    <div className="flex min-h-0 flex-col">
      <CandidateHeader
        mode={mode}
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
        linkedinUrl={bundle.candidate.linkedin_url ?? null}
        currentTab={tab}
        linkedContactId={bundle.candidate.linked_contact_id ?? null}
      />

      <div
        className={
          mode === "panel"
            ? "w-full px-6 py-6"
            : "mx-auto w-full max-w-6xl px-6 py-6"
        }
      >
        {tab === "details" ? (
          <CandidateDetalles
            candidate={bundle.candidate}
            profile={profile}
            companiesById={bundle.companiesById}
            applications={bundle.applications}
            stagesByJobId={view.stagesByJobId}
            focusApp={view.focusApp}
            addToJobOptions={addToJobOptions}
            transcripts={bundle.transcripts ?? []}
            tags={bundle.tags}
            notes={bundle.notes}
            portalComments={bundle.portalComments}
            sources={bundle.sources}
            customFields={customFields}
            mapsApiKey={mapsApiKey}
            revalidatePath={revalidatePath}
            isAdmin={isAdmin}
            t={t}
          />
        ) : null}

        {tab === "activity" ? (
          <CandidateActivity
            candidateId={bundle.candidate.id}
            notes={bundle.notes}
            events={activityEvents}
            isAdmin={isAdmin}
            revalidatePath={revalidatePath}
          />
        ) : null}

        {tab === "conversations" ? (
          <div className="mx-auto max-w-3xl">
            <div className="rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] px-4 py-10 text-center">
              <p className="text-sm font-medium">{t("candidatesArea.comingSoon")}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {t("candidatesArea.conversationsStubDesc")}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function parseTab(raw: string | undefined): CandidateTab {
  return raw === "activity" || raw === "conversations" ? raw : "details";
}
