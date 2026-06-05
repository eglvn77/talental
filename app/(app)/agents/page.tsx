import { getT } from "@/lib/i18n/server";
import { loadOrg } from "./_loaders/load-org";
import { loadBacklog } from "./_loaders/load-backlog";
import { loadRecentRuns } from "./_loaders/load-recent-runs";
import { CockpitTabs } from "./_components/cockpit-tabs";

export const dynamic = "force-dynamic";

/**
 * /agents — Talental OS cockpit. Renders the three-tab module
 * (Organization, Backlog, Dashboard). All data is server-loaded
 * here so the client component owns no fetching; deeper sub-views
 * lazy-load their own data as they're picked up.
 *
 * Fase 1: Organization is live; Backlog + Dashboard are placeholders
 * that get filled in by the next sub-phases (1d → 1g).
 */
export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; agent?: string }>;
}) {
  const t = await getT();
  const params = await searchParams;
  const initialTab =
    params.tab === "backlog" || params.tab === "dashboard"
      ? params.tab
      : "org";
  const [org, initiatives, recentRuns] = await Promise.all([
    loadOrg(),
    loadBacklog(),
    loadRecentRuns(20),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("agentsArea.pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("agentsArea.pageSubtitle")}
        </p>
      </header>
      <CockpitTabs
        initialTab={initialTab}
        org={org}
        initiatives={initiatives}
        recentRuns={recentRuns}
      />
    </main>
  );
}
