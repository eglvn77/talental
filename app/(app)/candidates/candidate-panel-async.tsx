import { CandidateSlideoverShell } from "./candidate-slideover-shell";
import { CandidateProfileView } from "./candidate-profile-view";
import type { CandidateTab } from "./candidate-screen";
import { loadCandidateView } from "./load-candidate-view";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";

/**
 * Async wrapper around the candidate slideover. Wrap with <Suspense>
 * in any page that opens the slideover via `?candidate=<id>` so the
 * page shell + table render immediately and the panel content streams
 * in once its (heavier) loader finishes.
 *
 * Before this change /candidates and /jobs/[id] awaited
 * loadCandidateView inside their main Promise.all, blocking the page
 * render on a 1-2 s query stack. Now the page renders at table speed
 * and the panel arrives on its own timeline.
 */
export async function CandidatePanelAsync({
  candidateId,
  focusAppId,
  tab,
}: {
  candidateId: string;
  focusAppId?: string | null;
  tab: CandidateTab;
}) {
  const [view, me, t] = await Promise.all([
    loadCandidateView(candidateId, focusAppId ?? undefined),
    getCurrentUser(),
    getT(),
  ]);
  if (!view) return null;
  const userIsAdmin = me ? isAdmin(me.team_member) : false;
  return (
    <CandidateSlideoverShell candidateName={view.bundle.candidate.full_name}>
      <CandidateProfileView
        view={view}
        tab={tab}
        mode="panel"
        isAdmin={userIsAdmin}
        mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
        t={t}
      />
    </CandidateSlideoverShell>
  );
}

/**
 * Minimal skeleton shown while CandidatePanelAsync is loading. Renders
 * the same dim backdrop + right-aligned card the real shell uses, so
 * the layout doesn't flicker when the content swaps in.
 */
export function CandidatePanelSkeleton() {
  return (
    <div className="fixed inset-0 z-40 bg-black/30">
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-10 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="space-y-3">
              <div className="h-32 animate-pulse rounded bg-muted/70" />
              <div className="h-48 animate-pulse rounded bg-muted/60" />
            </div>
            <div className="space-y-3">
              <div className="h-40 animate-pulse rounded bg-muted/70" />
              <div className="h-24 animate-pulse rounded bg-muted/60" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
