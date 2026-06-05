"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type {
  AgentKind,
  AgentRuntime,
  AgentStatus,
} from "@/lib/hiring/enums";
import type { AgentAreaRow } from "@/lib/hiring";
import type { AgentWithPrompt, OrgBundle } from "../_loaders/load-org";
import { AgentFormDialog } from "./agent-form-dialog";

/**
 * The Organization view: each area is a section, agents render as
 * cards inside. Read-only this sub-phase — click a card later (1b)
 * to open the edit slideover. Layout: simple stacked sections + a
 * 2-column card grid per area on >sm screens. Empty areas surface
 * an explicit placeholder so the page never has gaps.
 */
export function OrgView({ org }: { org: OrgBundle }) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const grouped = useMemo(() => groupAgentsByArea(org.areas, org.agents), [org]);

  // URL-driven dialog. ?agent=<uuid> → edit, ?agent=new[&area=<id>] →
  // create. Closing the dialog wipes the param so the URL stays clean.
  const agentParam = searchParams?.get("agent") ?? null;
  const createDefaultAreaId = searchParams?.get("area") ?? null;
  const openAgent =
    agentParam && agentParam !== "new"
      ? org.agents.find((a) => a.id === agentParam) ?? null
      : null;
  const isCreating = agentParam === "new";
  const dialogOpen = isCreating || openAgent !== null;
  const dialogAgent = isCreating
    ? null
    : (openAgent
        ? createDefaultAreaId
          ? { ...openAgent, area_id: createDefaultAreaId }
          : openAgent
        : null);

  function closeDialog() {
    const next = new URLSearchParams(searchParams ?? undefined);
    next.delete("agent");
    next.delete("area");
    const qs = next.toString();
    router.replace(qs ? `/agents?${qs}` : "/agents", { scroll: false });
  }

  function openCreateFor(areaId: string | null) {
    const next = new URLSearchParams(searchParams ?? undefined);
    next.set("agent", "new");
    if (areaId) next.set("area", areaId);
    else next.delete("area");
    router.replace(`/agents?${next.toString()}`, { scroll: false });
  }

  function openEdit(agentId: string) {
    const next = new URLSearchParams(searchParams ?? undefined);
    next.set("agent", agentId);
    router.replace(`/agents?${next.toString()}`, { scroll: false });
  }

  // For the create case we pre-fill area_id via a synthetic agent
  // shape — feels lighter than threading another prop through.
  const seedForCreate = isCreating && createDefaultAreaId
    ? ({
        area_id: createDefaultAreaId,
      } as Partial<AgentWithPrompt>)
    : null;

  return (
    <div className="space-y-7">
      {grouped.map(({ area, agents }) => (
        <section key={area.id} className="space-y-3">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{area.name}</h2>
              {area.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {area.description}
                </p>
              ) : null}
            </div>
            {/* Don't expose "+ Agent" on the orphan bucket — there's
                no real area to attach to. */}
            {area.id !== "__none" ? (
              <button
                type="button"
                onClick={() => openCreateFor(area.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                {t("agentsArea.addAgent")}
              </button>
            ) : null}
          </header>
          {agents.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-bg-2 px-3 py-4 text-center text-xs text-muted-foreground">
              {t("agentsArea.noAgentsInArea")}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {agents.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  onOpen={() => openEdit(a.id)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}

      <AgentFormDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!v) closeDialog();
        }}
        agent={dialogAgent}
        seedForCreate={seedForCreate}
        areas={org.areas}
      />
    </div>
  );
}

function groupAgentsByArea(
  areas: AgentAreaRow[],
  agents: AgentWithPrompt[],
): Array<{ area: AgentAreaRow; agents: AgentWithPrompt[] }> {
  // Build a Map keyed by area_id so we can preserve area order and
  // attach un-areaed agents at the end under a synthetic "Sin área".
  const byArea = new Map<string, AgentWithPrompt[]>();
  for (const a of agents) {
    const key = a.area_id ?? "__none";
    const arr = byArea.get(key) ?? [];
    arr.push(a);
    byArea.set(key, arr);
  }
  // Within each area: chief_of_staff → area_lead → executor, then
  // position asc (already pre-sorted by the loader on position+name).
  const KIND_ORDER: Record<AgentKind, number> = {
    chief_of_staff: 0,
    area_lead: 1,
    executor: 2,
  };
  const out = areas.map((area) => ({
    area,
    agents: (byArea.get(area.id) ?? []).slice().sort((x, y) => {
      const dk = KIND_ORDER[x.kind as AgentKind] - KIND_ORDER[y.kind as AgentKind];
      return dk !== 0 ? dk : x.position - y.position;
    }),
  }));
  const orphans = byArea.get("__none") ?? [];
  if (orphans.length > 0) {
    out.push({
      area: {
        id: "__none",
        workspace_id: "",
        key: "_none",
        name: "Sin área",
        description: null,
        position: 9999,
        created_at: "",
        updated_at: "",
      },
      agents: orphans,
    });
  }
  return out;
}

function AgentCard({
  agent,
  onOpen,
}: {
  agent: AgentWithPrompt;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-md border border-border bg-card p-3 transition-colors hover:border-foreground/20 focus:border-accent focus:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{agent.name}</h3>
          {agent.role_title ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {agent.role_title}
            </p>
          ) : null}
        </div>
        <StatusBadge status={agent.status as AgentStatus} t={t} />
      </div>
      {agent.description ? (
        <p className="mt-2 line-clamp-2 text-xs text-foreground/80">
          {agent.description}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <KindChip kind={agent.kind as AgentKind} t={t} />
        <RuntimeChip runtime={agent.runtime as AgentRuntime} t={t} />
        {agent.slack_channel_id ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
            <SlackDot /> {agent.slack_channel_id}
          </span>
        ) : null}
        {agent.prompt ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
            prompt: {agent.prompt.label}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5">
            {t("agentsArea.noPromptLinked")}
          </span>
        )}
        {agent.schedule_cron ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono">
            {agent.schedule_cron}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: AgentStatus;
  t: (key: string) => string;
}) {
  const map: Record<AgentStatus, { label: string; cls: string }> = {
    active: {
      label: t("agentsArea.statusActive"),
      cls: "bg-positive-soft text-positive border-positive/30",
    },
    planned: {
      label: t("agentsArea.statusPlanned"),
      cls: "bg-muted text-muted-foreground border-border",
    },
    paused: {
      label: t("agentsArea.statusPaused"),
      cls: "bg-warning-soft text-warning border-warning/30",
    },
  };
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        s.cls,
      )}
    >
      {s.label}
    </span>
  );
}

function KindChip({
  kind,
  t,
}: {
  kind: AgentKind;
  t: (key: string) => string;
}) {
  const label =
    kind === "chief_of_staff"
      ? t("agentsArea.kindChief")
      : kind === "area_lead"
        ? t("agentsArea.kindLead")
        : t("agentsArea.kindExecutor");
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
      {label}
    </span>
  );
}

function RuntimeChip({
  runtime,
  t,
}: {
  runtime: AgentRuntime;
  t: (key: string) => string;
}) {
  const label =
    runtime === "claude_code"
      ? t("agentsArea.runtimeClaudeCode")
      : t("agentsArea.runtimeInApp");
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
      {label}
    </span>
  );
}

function SlackDot() {
  // tiny inline indicator — avoids importing a brand icon we don't
  // need for the read-only card.
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 rounded-full bg-accent"
    />
  );
}
