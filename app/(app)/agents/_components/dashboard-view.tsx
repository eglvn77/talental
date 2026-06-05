"use client";

import { useMemo } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import {
  INITIATIVE_STATUSES,
  INITIATIVE_PRIORITIES,
} from "@/lib/hiring/enums";
import type {
  AgentRunStatus,
  InitiativePriority,
  InitiativeStatus,
} from "@/lib/hiring/enums";
import type { AgentAreaRow, InitiativeRow } from "@/lib/hiring";
import type { RecentRun } from "../_loaders/load-recent-runs";

/**
 * Dashboard: at-a-glance health of the cockpit. Top cards are
 * per-area initiative counts split by status/priority; bottom is
 * the recent agent_runs feed. No editing here — it's a read-only
 * pulse view.
 */
export function DashboardView({
  initiatives,
  areas,
  recentRuns,
}: {
  initiatives: InitiativeRow[];
  areas: AgentAreaRow[];
  recentRuns: RecentRun[];
}) {
  const t = useT();
  const byArea = useMemo(() => {
    const map = new Map<string, InitiativeRow[]>();
    for (const a of areas) map.set(a.id, []);
    map.set("__none", []);
    for (const it of initiatives) {
      const key = it.area_id ?? "__none";
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return map;
  }, [areas, initiatives]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold">
          {t("agentsArea.dashByArea")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <AreaCard
              key={area.id}
              area={area}
              items={byArea.get(area.id) ?? []}
              t={t}
            />
          ))}
          {(byArea.get("__none")?.length ?? 0) > 0 ? (
            <AreaCard
              area={{
                id: "__none",
                workspace_id: "",
                key: "_none",
                name: "Sin área",
                description: null,
                position: 9999,
                created_at: "",
                updated_at: "",
              }}
              items={byArea.get("__none") ?? []}
              t={t}
            />
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">
          {t("agentsArea.dashRecentRuns")}
        </h2>
        {recentRuns.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-bg-2 px-3 py-8 text-center text-xs text-muted-foreground">
            {t("agentsArea.dashNoRuns")}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-md border border-border">
            {recentRuns.map((r, i) => (
              <li
                key={r.id}
                className={cn(
                  "flex items-start gap-3 px-3 py-2 text-xs",
                  i > 0 && "border-t border-border",
                )}
              >
                <RunStatusIcon status={r.status as AgentRunStatus} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {r.agent?.name ?? "—"}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatWhen(r.finished_at ?? r.started_at)}
                    </span>
                  </div>
                  {r.summary ? (
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                      {r.summary}
                    </p>
                  ) : null}
                  {r.tokens != null ? (
                    <span className="mt-1 inline-block text-[10px] text-muted-foreground tabular-nums">
                      {r.tokens.toLocaleString()} tokens
                    </span>
                  ) : null}
                  {r.error ? (
                    <p className="mt-1 line-clamp-2 text-[10px] text-danger">
                      {r.error}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AreaCard({
  area,
  items,
  t,
}: {
  area: AgentAreaRow;
  items: InitiativeRow[];
  t: (k: string) => string;
}) {
  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of INITIATIVE_STATUSES) m[s] = 0;
    for (const it of items) m[it.status] = (m[it.status] ?? 0) + 1;
    return m;
  }, [items]);
  const byPriority = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of INITIATIVE_PRIORITIES) m[p] = 0;
    for (const it of items) {
      if (it.priority) m[it.priority] = (m[it.priority] ?? 0) + 1;
    }
    return m;
  }, [items]);

  return (
    <article className="rounded-md border border-border bg-card p-3">
      <header className="mb-2">
        <h3 className="text-sm font-semibold">{area.name}</h3>
        <p className="text-[11px] text-muted-foreground">
          {items.length} {items.length === 1 ? "initiative" : "initiatives"}
        </p>
      </header>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {t("agentsArea.backlogEmpty")}
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
            {INITIATIVE_STATUSES.filter((s) => byStatus[s] > 0).map((s) => (
              <div
                key={s}
                className="flex items-center justify-between rounded border border-border bg-bg-2 px-2 py-1"
              >
                <span className="text-muted-foreground">
                  {t(`agentsArea.initStatus.${s}` as const)}
                </span>
                <span className="font-mono tabular-nums">{byStatus[s]}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {INITIATIVE_PRIORITIES.filter((p) => byPriority[p] > 0).map((p) => (
              <PriorityBadge
                key={p}
                priority={p as InitiativePriority}
                count={byPriority[p] ?? 0}
              />
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function PriorityBadge({
  priority,
  count,
}: {
  priority: InitiativePriority;
  count: number;
}) {
  const cls =
    priority === "P0"
      ? "bg-danger-soft text-danger border-danger/30"
      : priority === "P1"
        ? "bg-warning-soft text-warning border-warning/30"
        : priority === "P2"
          ? "bg-accent/15 text-accent border-accent/30"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
        cls,
      )}
    >
      {priority}
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

function RunStatusIcon({ status }: { status: AgentRunStatus }) {
  if (status === "ok") {
    return (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
    );
  }
  if (status === "error") {
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />;
  }
  return (
    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
