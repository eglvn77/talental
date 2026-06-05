"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LayoutGrid, List, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import type {
  InitiativePriority,
  InitiativeStatus,
  InitiativeType,
} from "@/lib/hiring/enums";
import {
  INITIATIVE_PRIORITIES,
  INITIATIVE_STATUSES,
  INITIATIVE_TYPES,
} from "@/lib/hiring/enums";
import type { AgentAreaRow, InitiativeRow } from "@/lib/hiring";
import type { AgentWithPrompt } from "../_loaders/load-org";
import { moveInitiativeAction } from "../_actions/initiatives";
import { InitiativeFormDialog } from "./initiative-form-dialog";

/**
 * Backlog tab: filterable list of initiatives that can be viewed as
 * a table OR a kanban (columns = status). Drag-to-change-status is
 * the headline interaction in kanban mode; the table is for triage.
 *
 * Filter state is in-memory only — like the existing tables in
 * /jobs and /candidates, this errs on the side of "fresh start each
 * navigation" rather than persisting through every URL.
 */
export function BacklogView({
  initiatives,
  areas,
  agents,
}: {
  initiatives: InitiativeRow[];
  areas: AgentAreaRow[];
  agents: AgentWithPrompt[];
}) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [filterArea, setFilterArea] = useState<Set<string>>(new Set());
  const [filterAgent, setFilterAgent] = useState<Set<string>>(new Set());
  const [filterPriority, setFilterPriority] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return initiatives.filter((it) => {
      if (filterArea.size > 0) {
        if (!it.area_id || !filterArea.has(it.area_id)) return false;
      }
      if (filterAgent.size > 0) {
        if (!it.agent_id || !filterAgent.has(it.agent_id)) return false;
      }
      if (filterPriority.size > 0) {
        if (!it.priority || !filterPriority.has(it.priority)) return false;
      }
      if (filterType.size > 0) {
        if (!filterType.has(it.type)) return false;
      }
      return true;
    });
  }, [initiatives, filterArea, filterAgent, filterPriority, filterType]);

  // URL-driven dialog same pattern as agent: ?initiative=<id|new>.
  const initiativeParam = searchParams?.get("initiative") ?? null;
  const openInitiative =
    initiativeParam && initiativeParam !== "new"
      ? initiatives.find((it) => it.id === initiativeParam) ?? null
      : null;
  const isCreating = initiativeParam === "new";
  const dialogOpen = isCreating || openInitiative !== null;

  function openCreate() {
    const next = new URLSearchParams(searchParams ?? undefined);
    next.set("initiative", "new");
    router.replace(`/agents?${next.toString()}`, { scroll: false });
  }
  function openEdit(id: string) {
    const next = new URLSearchParams(searchParams ?? undefined);
    next.set("initiative", id);
    router.replace(`/agents?${next.toString()}`, { scroll: false });
  }
  function closeDialog() {
    const next = new URLSearchParams(searchParams ?? undefined);
    next.delete("initiative");
    const qs = next.toString();
    router.replace(qs ? `/agents?${qs}` : "/agents", { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle view={view} onChange={setView} t={t} />
          <FilterChips
            label={t("agentsArea.filterArea")}
            options={areas.map((a) => ({ value: a.id, label: a.name }))}
            selected={filterArea}
            onChange={setFilterArea}
          />
          <FilterChips
            label={t("agentsArea.filterAgent")}
            options={agents.map((a) => ({ value: a.id, label: a.name }))}
            selected={filterAgent}
            onChange={setFilterAgent}
          />
          <FilterChips
            label={t("agentsArea.filterPriority")}
            options={INITIATIVE_PRIORITIES.map((p) => ({
              value: p,
              label: p,
            }))}
            selected={filterPriority}
            onChange={setFilterPriority}
          />
          <FilterChips
            label={t("agentsArea.filterType")}
            options={INITIATIVE_TYPES.map((tp) => ({
              value: tp,
              label: t(`agentsArea.initType.${tp}`),
            }))}
            selected={filterType}
            onChange={setFilterType}
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-fg-on-accent hover:bg-accent/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("agentsArea.newInitiative")}
        </button>
      </div>

      {view === "kanban" ? (
        <KanbanBoard
          initiatives={filtered}
          areas={areas}
          agents={agents}
          onCardOpen={openEdit}
        />
      ) : (
        <TableView
          initiatives={filtered}
          areas={areas}
          agents={agents}
          onRowOpen={openEdit}
          t={t}
        />
      )}

      <InitiativeFormDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!v) closeDialog();
        }}
        initiative={openInitiative}
        areas={areas}
        agents={agents}
      />
    </div>
  );
}

// ── View toggle ─────────────────────────────────────────────────────
function ViewToggle({
  view,
  onChange,
  t,
}: {
  view: "kanban" | "table";
  onChange: (v: "kanban" | "table") => void;
  t: (k: string) => string;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("kanban")}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1",
          view === "kanban"
            ? "bg-accent text-fg-on-accent"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="h-3 w-3" />
        {t("agentsArea.viewKanban")}
      </button>
      <button
        type="button"
        onClick={() => onChange("table")}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1",
          view === "table"
            ? "bg-accent text-fg-on-accent"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="h-3 w-3" />
        {t("agentsArea.viewTable")}
      </button>
    </div>
  );
}

// ── Filter chips ────────────────────────────────────────────────────
function FilterChips({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted",
          selected.size > 0 && "border-accent/50 bg-accent/5",
        )}
      >
        {label}
        {selected.size > 0 ? (
          <span className="rounded bg-muted px-1 text-[10px]">
            {selected.size}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-dropdown">
            {options.map((o) => {
              const checked = selected.has(o.value);
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(selected);
                      if (checked) next.delete(o.value);
                      else next.add(o.value);
                      onChange(next);
                    }}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              );
            })}
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="block w-full border-t border-border px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted"
              >
                Limpiar
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Kanban ──────────────────────────────────────────────────────────
function KanbanBoard({
  initiatives,
  areas,
  agents,
  onCardOpen,
}: {
  initiatives: InitiativeRow[];
  areas: AgentAreaRow[];
  agents: AgentWithPrompt[];
  onCardOpen: (id: string) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [, start] = useTransition();
  // Local optimistic copy so the drag UX doesn't wait for the server.
  // Source of truth is server props — we resync on every render.
  const [local, setLocal] = useState<InitiativeRow[]>(initiatives);
  // Reset local when server data updates.
  useMemo(() => setLocal(initiatives), [initiatives]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const areaById = useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a])),
    [areas],
  );
  const agentById = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.id, a])),
    [agents],
  );

  const byStatus = useMemo(() => {
    const m = new Map<InitiativeStatus, InitiativeRow[]>();
    for (const s of INITIATIVE_STATUSES) m.set(s, []);
    for (const it of local) {
      const arr = m.get(it.status as InitiativeStatus);
      if (arr) arr.push(it);
    }
    // Each column is already pre-sorted by `position` from the loader.
    return m;
  }, [local]);

  function handleDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    const moved = local.find((x) => x.id === activeId);
    if (!moved) return;

    // overId is either another card id (reorder within column or
    // cross-column drop) or a column id (drop on empty column).
    const overItem = local.find((x) => x.id === overId);
    const destStatus = (
      overItem ? overItem.status : (overId as InitiativeStatus)
    ) as InitiativeStatus;

    if (
      moved.status === destStatus &&
      activeId === overId
    ) {
      return;
    }

    // Build the destination column's new ordering.
    const destColIds = local
      .filter((x) => x.status === destStatus && x.id !== activeId)
      .map((x) => x.id);
    const insertIdx = overItem
      ? destColIds.indexOf(overItem.id)
      : destColIds.length;
    const finalIdx = insertIdx < 0 ? destColIds.length : insertIdx;
    const destOrderedIds = [
      ...destColIds.slice(0, finalIdx),
      activeId,
      ...destColIds.slice(finalIdx),
    ];

    // Optimistic local update.
    setLocal((prev) =>
      prev.map((x) =>
        x.id === activeId
          ? { ...x, status: destStatus, position: finalIdx }
          : x,
      ),
    );

    start(async () => {
      const res = await moveInitiativeAction({
        id: activeId,
        toStatus: destStatus,
        destOrderedIds,
      });
      if (!res.ok) {
        toast.actionFailed("move", res.error);
        // Roll back by refreshing from server.
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {INITIATIVE_STATUSES.map((status) => {
          const items = byStatus.get(status) ?? [];
          return (
            <Column
              key={status}
              status={status}
              items={items}
              areaById={areaById}
              agentById={agentById}
              onCardOpen={onCardOpen}
              t={t}
            />
          );
        })}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  items,
  areaById,
  agentById,
  onCardOpen,
  t,
}: {
  status: InitiativeStatus;
  items: InitiativeRow[];
  areaById: Record<string, AgentAreaRow>;
  agentById: Record<string, AgentWithPrompt>;
  onCardOpen: (id: string) => void;
  t: (k: string) => string;
}) {
  // SortableContext id must match what handleDragEnd sees as overId
  // for an empty-column drop — we use the status string for that.
  const { setNodeRef } = useSortable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className="flex w-72 shrink-0 flex-col rounded-md border border-border bg-bg-2"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t(`agentsArea.initStatus.${status}`)}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
          {items.length}
        </span>
      </div>
      <SortableContext
        items={items.map((it) => it.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex min-h-[80px] flex-col gap-1.5 p-2">
          {items.map((it) => (
            <KanbanCard
              key={it.id}
              initiative={it}
              area={it.area_id ? areaById[it.area_id] : undefined}
              agent={it.agent_id ? agentById[it.agent_id] : undefined}
              onOpen={() => onCardOpen(it.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </div>
  );
}

function KanbanCard({
  initiative,
  area,
  agent,
  onOpen,
}: {
  initiative: InitiativeRow;
  area?: AgentAreaRow;
  agent?: AgentWithPrompt;
  onOpen: () => void;
}) {
  const t = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: initiative.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="cursor-pointer rounded-md border border-border bg-card p-2 text-xs hover:border-foreground/20"
    >
      <div className="mb-1 flex items-center gap-1.5">
        {initiative.priority ? (
          <PriorityPill priority={initiative.priority as InitiativePriority} />
        ) : null}
        <TypePill type={initiative.type as InitiativeType} t={t} />
      </div>
      <p className="font-medium leading-snug">{initiative.title}</p>
      {area || agent ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          {area ? <span>{area.name}</span> : null}
          {agent ? (
            <>
              {area ? <span>·</span> : null}
              <span>{agent.name}</span>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// ── Table ───────────────────────────────────────────────────────────
function TableView({
  initiatives,
  areas,
  agents,
  onRowOpen,
  t,
}: {
  initiatives: InitiativeRow[];
  areas: AgentAreaRow[];
  agents: AgentWithPrompt[];
  onRowOpen: (id: string) => void;
  t: (k: string) => string;
}) {
  const areaById = useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a])),
    [areas],
  );
  const agentById = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.id, a])),
    [agents],
  );

  if (initiatives.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-bg-2 px-3 py-8 text-center text-xs text-muted-foreground">
        {t("agentsArea.backlogEmpty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{t("agentsArea.initiativeTitle")}</th>
            <th className="px-3 py-2">{t("agentsArea.initiativeType")}</th>
            <th className="px-3 py-2">
              {t("agentsArea.initiativePriority")}
            </th>
            <th className="px-3 py-2">
              {t("agentsArea.initiativeStatus")}
            </th>
            <th className="px-3 py-2">{t("agentsArea.initiativeArea")}</th>
            <th className="px-3 py-2">{t("agentsArea.initiativeAgent")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {initiatives.map((it) => (
            <tr
              key={it.id}
              onClick={() => onRowOpen(it.id)}
              className="cursor-pointer hover:bg-muted/40"
            >
              <td className="px-3 py-2 font-medium">{it.title}</td>
              <td className="px-3 py-2">
                <TypePill type={it.type as InitiativeType} t={t} />
              </td>
              <td className="px-3 py-2">
                {it.priority ? (
                  <PriorityPill priority={it.priority as InitiativePriority} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <span className="text-xs">
                  {t(`agentsArea.initStatus.${it.status}`)}
                </span>
              </td>
              <td className="px-3 py-2 text-xs">
                {it.area_id ? areaById[it.area_id]?.name : "—"}
              </td>
              <td className="px-3 py-2 text-xs">
                {it.agent_id ? agentById[it.agent_id]?.name : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pills ───────────────────────────────────────────────────────────
function PriorityPill({ priority }: { priority: InitiativePriority }) {
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
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
        cls,
      )}
    >
      {priority}
    </span>
  );
}

function TypePill({
  type,
  t,
}: {
  type: InitiativeType;
  t: (k: string) => string;
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {t(`agentsArea.initType.${type}`)}
    </span>
  );
}
