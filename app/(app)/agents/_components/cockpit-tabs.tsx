"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { OrgView } from "./org-view";
import { BacklogView } from "./backlog-view";
import { DashboardView } from "./dashboard-view";
import type { OrgBundle } from "../_loaders/load-org";
import type { RecentRun } from "../_loaders/load-recent-runs";
import type { InitiativeRow } from "@/lib/hiring";

type TabKey = "org" | "backlog" | "dashboard";

/**
 * Top-level cockpit switcher. Same shape as the paquete tabs on the
 * job detail page — kept minimal because each tab body owns its
 * own layout. Backlog + Dashboard are placeholders this commit;
 * filled in by sub-phases 1d–1g.
 */
export function CockpitTabs({
  initialTab,
  org,
  initiatives,
  recentRuns,
}: {
  initialTab: TabKey;
  org: OrgBundle;
  initiatives: InitiativeRow[];
  recentRuns: RecentRun[];
}) {
  const t = useT();
  const [tab, setTab] = useState<TabKey>(initialTab);

  const tabs: Array<{ key: TabKey; label: string; render: () => ReactNode }> = [
    {
      key: "org",
      label: t("agentsArea.tabOrg"),
      render: () => <OrgView org={org} />,
    },
    {
      key: "backlog",
      label: t("agentsArea.tabBacklog"),
      render: () => (
        <BacklogView
          initiatives={initiatives}
          areas={org.areas}
          agents={org.agents}
        />
      ),
    },
    {
      key: "dashboard",
      label: t("agentsArea.tabDashboard"),
      render: () => (
        <DashboardView
          initiatives={initiatives}
          areas={org.areas}
          recentRuns={recentRuns}
        />
      ),
    },
  ];

  const current = tabs.find((x) => x.key === tab) ?? tabs[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setTab(x.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === x.key
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div>{current?.render()}</div>
    </div>
  );
}
