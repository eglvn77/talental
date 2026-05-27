"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  DragOverlay,
  useDroppable,
} from "@dnd-kit/core";
import { useSortable, SortableContext } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronsLeft, ChevronsRight, ExternalLink, Maximize2, Minimize2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import {
  bulkDeleteApplicationsAction,
  bulkMoveApplicationsAction,
  moveApplicationToStageAction,
} from "../../actions";
import { RejectionReasonDialog } from "./_components/rejection-reason-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";

type CardData = {
  application: ApplicationRow;
  candidate: CandidateRow | null;
  tags: TagRow[];
};

export function PipelineBoard({
  jobId,
  stages,
  applications,
  candidatesById: candidatesMap,
  tagsByApplicationId,
  workModality,
}: {
  jobId: string;
  stages: PipelineStageRow[];
  applications: ApplicationRow[];
  candidatesById: Record<string, CandidateRow>;
  tagsByApplicationId: Record<string, TagRow[]>;
  workModality?: "remote" | "hybrid" | "onsite" | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  // dnd-kit's aria-describedby uses a global counter that drifts between SSR
  // and client. Defer the DnD tree until after mount to avoid hydration noise.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Collapsed-column preferences. Pref shape:
  //   { collapsed: boolean, setWhenEmpty: boolean }
  // The `setWhenEmpty` flag records the column's empty/non-empty state
  // at the moment the user toggled it. The pref only stays in effect
  // while that state holds — when the column flips between empty and
  // non-empty, the pref auto-clears and we fall back to the default
  // (collapse iff empty). That keeps the system feeling alive: a card
  // moving into a collapsed empty stage auto-expands it on the next
  // render, and a stage that becomes empty after losing its last card
  // auto-collapses. Manual collapses on a stage that still has cards
  // continue to stick (and survive more cards arriving) — that's the
  // "persistent until user changes it" half.
  type CollapsePref = { collapsed: boolean; setWhenEmpty: boolean };
  const collapseStorageKey = `jobs.${jobId}.kanban.collapsed.v2`;
  const [collapsePrefs, setCollapsePrefs] = useState<
    Record<string, CollapsePref>
  >({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(collapseStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Drop anything that doesn't match the v2 shape — old boolean
      // entries from the previous schema would otherwise misbehave.
      const cleaned: Record<string, CollapsePref> = {};
      for (const [k, v] of Object.entries(parsed ?? {})) {
        if (
          v &&
          typeof v === "object" &&
          typeof (v as CollapsePref).collapsed === "boolean" &&
          typeof (v as CollapsePref).setWhenEmpty === "boolean"
        ) {
          cleaned[k] = v as CollapsePref;
        }
      }
      setCollapsePrefs(cleaned);
    } catch {
      /* ignore — start fresh */
    }
  }, [collapseStorageKey]);
  function toggleCollapsed(
    stageId: string,
    cardCount: number,
    currentlyCollapsed: boolean,
  ) {
    // Record both the new state AND the empty-context, so the pref
    // applies only while the column stays in the same emptiness it
    // had when the user toggled.
    const next = {
      ...collapsePrefs,
      [stageId]: {
        collapsed: !currentlyCollapsed,
        setWhenEmpty: cardCount === 0,
      },
    };
    setCollapsePrefs(next);
    try {
      window.localStorage.setItem(collapseStorageKey, JSON.stringify(next));
    } catch {
      /* private mode etc. */
    }
  }
  /**
   * Bulk-set every stage's collapse pref. Lets the user expand or
   * collapse the whole board at once instead of clicking each column.
   * We record `setWhenEmpty` per-stage so the same auto-clear logic
   * applies as for individual toggles (the pref survives until the
   * column crosses the 0/N emptiness boundary).
   */
  function setAllCollapsed(target: boolean) {
    const next: Record<string, CollapsePref> = { ...collapsePrefs };
    for (const s of stages) {
      const count = cardsByStage.byStage.get(s.id)?.length ?? 0;
      next[s.id] = { collapsed: target, setWhenEmpty: count === 0 };
    }
    setCollapsePrefs(next);
    try {
      window.localStorage.setItem(collapseStorageKey, JSON.stringify(next));
    } catch {
      /* private mode etc. */
    }
  }

  function isCollapsed(stageId: string, cardCount: number): boolean {
    const pref = collapsePrefs[stageId];
    if (pref) {
      const nowEmpty = cardCount === 0;
      // Pref only applies while the empty-context matches. If the
      // column has crossed the 0/N boundary since the user set this
      // pref, fall back to the default so auto-collapse/expand kicks
      // back in.
      if (pref.setWhenEmpty === nowEmpty) return pref.collapsed;
    }
    return cardCount === 0;
  }

  const initialCards: CardData[] = useMemo(
    () =>
      applications.map((a) => ({
        application: a,
        candidate: candidatesMap[a.candidate_id] ?? null,
        tags: tagsByApplicationId[a.id] ?? [],
      })),
    [applications, candidatesMap, tagsByApplicationId],
  );

  // Optimistic state: list of cards with their (possibly-pending) stage_id.
  type OptAction =
    | { kind: "move"; applicationId: string; toStageId: string }
    | { kind: "remove"; applicationId: string }
    | { kind: "revert"; cards: CardData[] };

  const [optimisticCards, applyOptimistic] = useOptimistic(
    initialCards,
    (state, action: OptAction) => {
      if (action.kind === "revert") return action.cards;
      if (action.kind === "remove") {
        return state.filter((c) => c.application.id !== action.applicationId);
      }
      // Bump `status_changed_at` so the moved card jumps to the top
      // of the destination column immediately — without this the
      // recency sort waits for the server round-trip + refresh.
      const now = new Date().toISOString();
      return state.map((c) =>
        c.application.id === action.applicationId
          ? {
              ...c,
              application: {
                ...c.application,
                stage_id: action.toStageId,
                status_changed_at: now,
              },
            }
          : c,
      );
    },
  );

  const cardsByStage = useMemo(() => {
    const map = new Map<string, CardData[]>();
    for (const s of stages) map.set(s.id, []);
    const orphan: CardData[] = [];
    for (const c of optimisticCards) {
      if (c.application.stage_id && map.has(c.application.stage_id)) {
        map.get(c.application.stage_id)!.push(c);
      } else {
        orphan.push(c);
      }
    }
    // Sort each column by most-recent activity first. `status_changed_at`
    // is the best signal we have on the application — it bumps when a
    // card moves stages, gets a status update, or is re-applied. Cards
    // optimistically moved get an immediate `status_changed_at = now`
    // in the reducer above, so they jump to the top instantly.
    const byActivityDesc = (a: CardData, b: CardData) =>
      (b.application.status_changed_at ?? "").localeCompare(
        a.application.status_changed_at ?? "",
      );
    for (const cards of map.values()) cards.sort(byActivityDesc);
    orphan.sort(byActivityDesc);
    return { byStage: map, orphan };
  }, [optimisticCards, stages]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const activeCard =
    activeId != null
      ? optimisticCards.find((c) => c.application.id === activeId) ?? null
      : null;

  function findStageOf(applicationId: string): string | null {
    return (
      optimisticCards.find((c) => c.application.id === applicationId)
        ?.application.stage_id ?? null
    );
  }

  // ----- Bulk-action selection state. -----
  // Set of application ids currently checkbox-selected. Drives the
  // top toolbar (count + stage picker) and the "always visible"
  // checkbox treatment on member cards. The card's checkbox toggles
  // membership; the toolbar applies the bulk move via
  // bulkMoveApplicationsAction.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionSize = selectedIds.size;
  function toggleSelected(applicationId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(applicationId);
      else next.delete(applicationId);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Pending bulk rejection — analogous to pendingReject for single
  // cards, but pulls the candidate names from the current selection
  // for the dialog header copy.
  const [pendingBulkReject, setPendingBulkReject] = useState<{
    applicationIds: string[];
    targetStageId: string;
  } | null>(null);

  // Pending bulk delete confirmation. Holds the snapshot of selected
  // ids so the ConfirmDialog can act on the exact set the recruiter
  // chose even if they keep toggling cards while the dialog is open.
  const [pendingBulkDelete, setPendingBulkDelete] = useState<
    string[] | null
  >(null);

  function onBulkDelete() {
    if (selectionSize === 0) return;
    setPendingBulkDelete(Array.from(selectedIds));
  }

  function commitBulkDelete(ids: string[]) {
    // Optimistic removal so the cards disappear immediately. Failure
    // path triggers a refresh which re-derives the board from props.
    for (const id of ids) {
      applyOptimistic({ kind: "remove", applicationId: id });
    }
    startTransition(async () => {
      const res = await bulkDeleteApplicationsAction(ids);
      if (!res.ok) {
        toast.actionFailed("No se pudo eliminar", res.error);
      } else {
        toast.actionOk(
          `${res.data?.deleted ?? ids.length} ${(res.data?.deleted ?? ids.length) === 1 ? "candidato eliminado" : "candidatos eliminados"}`,
        );
      }
      clearSelection();
      router.refresh();
    });
  }

  function commitBulkMove(
    applicationIds: string[],
    targetStageId: string,
    options?: { rejectionReasonId?: string; rejectionNotes?: string },
  ) {
    startTransition(async () => {
      // Optimistic: move all selected cards into the target column.
      for (const id of applicationIds) {
        applyOptimistic({ kind: "move", applicationId: id, toStageId: targetStageId });
      }
      const res = await bulkMoveApplicationsAction(
        applicationIds,
        targetStageId,
        options,
      );
      if (!res.ok) {
        toast.actionFailed("No se pudo mover", res.error);
        // Easier than per-id revert: trigger a router.refresh which
        // re-derives optimisticCards from props.
      }
      clearSelection();
      router.refresh();
    });
  }

  function onBulkMoveToStage(targetStageId: string) {
    if (selectionSize === 0) return;
    const ids = Array.from(selectedIds);
    const targetStage = stages.find((s) => s.id === targetStageId);
    if (targetStage?.category === "rejected") {
      setPendingBulkReject({ applicationIds: ids, targetStageId });
      return;
    }
    commitBulkMove(ids, targetStageId);
  }


  // Pending rejection — when a card is dropped into a stage whose
  // category is 'rejected', we stash the move here and open the
  // reason picker dialog instead of committing immediately. The
  // dialog's onConfirm finishes the move with the picked reason.
  // Cancel reverts the optimistic state.
  const [pendingReject, setPendingReject] = useState<{
    applicationId: string;
    targetStageId: string;
    candidateName: string;
    snapshot: typeof optimisticCards;
  } | null>(null);

  function commitMove(
    applicationId: string,
    targetStageId: string,
    snapshot: typeof optimisticCards,
    options?: { rejectionReasonId?: string; rejectionNotes?: string },
  ) {
    startTransition(async () => {
      const res = await moveApplicationToStageAction(
        applicationId,
        targetStageId,
        options,
      );
      if (!res.ok) {
        applyOptimistic({ kind: "revert", cards: snapshot });
      }
      router.refresh();
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const applicationId = String(active.id);
    // `over.id` is either a stage id (column) or another card id.
    let targetStageId: string | null = null;
    if (typeof over.id === "string") {
      if (stages.some((s) => s.id === over.id)) {
        targetStageId = over.id;
      } else {
        // Hovering over another card → use that card's stage.
        const overCard = optimisticCards.find(
          (c) => c.application.id === over.id,
        );
        if (overCard?.application.stage_id) {
          targetStageId = overCard.application.stage_id;
        }
      }
    }
    if (!targetStageId) return;
    const currentStageId = findStageOf(applicationId);
    if (targetStageId === currentStageId) return;

    const snapshot = optimisticCards;
    const targetStage = stages.find((s) => s.id === targetStageId);
    // Apply optimistic move so the card visibly lands in the new
    // column while we either run the action straight through, or
    // wait for the reason picker. If the picker is cancelled we
    // revert via the snapshot.
    applyOptimistic({ kind: "move", applicationId, toStageId: targetStageId });

    if (targetStage?.category === "rejected") {
      const card = snapshot.find((c) => c.application.id === applicationId);
      const candidateName =
        card?.candidate?.full_name ?? card?.candidate?.email ?? "Candidato";
      setPendingReject({
        applicationId,
        targetStageId,
        candidateName,
        snapshot,
      });
      return;
    }

    commitMove(applicationId, targetStageId, snapshot);
  }

  // First paint: render a hooks-free skeleton with stage names + counts so
  // SSR and the initial client render produce identical HTML. After mount,
  // swap in the full DnD-wired board (Column/useSortable generate per-render
  // IDs that drift between server and client).
  if (!mounted) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const cards = cardsByStage.byStage.get(stage.id) ?? [];
          return (
            <div
              key={stage.id}
              className="flex h-[calc(100vh-280px)] w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30"
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                {/* Skeleton mirror of Column's tinted-pill header so
                    SSR + the post-mount swap render identical chrome. */}
                <span
                  className="inline-flex min-w-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    background: (stage.color ?? "#94a3b8") + "22",
                    color: stage.color ?? "#94a3b8",
                  }}
                >
                  <span className="truncate">{stage.name}</span>
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
                  {cards.length}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const modality = workModality ?? null;
  const anySelected = selectionSize > 0;
  // True when at least one stage is currently collapsed — drives the
  // single bulk button's icon + label between expand-all / collapse-all.
  const anyCollapsed = stages.some((s) => {
    const count = cardsByStage.byStage.get(s.id)?.length ?? 0;
    return isCollapsed(s.id, count);
  });
  const board = (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const cards = cardsByStage.byStage.get(stage.id) ?? [];
        const collapsed = isCollapsed(stage.id, cards.length);
        return (
          <Column
            key={stage.id}
            stage={stage}
            cards={cards}
            workModality={modality}
            collapsed={collapsed}
            onToggleCollapsed={() =>
              toggleCollapsed(stage.id, cards.length, collapsed)
            }
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            anySelected={anySelected}
          />
        );
      })}
      {cardsByStage.orphan.length > 0 ? (
        <UnstageColumn
          cards={cardsByStage.orphan}
          workModality={modality}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          anySelected={anySelected}
        />
      ) : null}
    </div>
  );

  // Pointer-first collision: the drop target is whichever column the cursor
  // is currently inside. Fall back to rectIntersection only when the cursor
  // is briefly outside any droppable (e.g. between columns). Avoids the
  // closestCorners behaviour that prefers wider neighbors over narrow
  // collapsed columns.
  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    return pointer.length > 0 ? pointer : rectIntersection(args);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {selectionSize > 0 ? (
        <BulkActionBar
          count={selectionSize}
          stages={stages}
          onMove={onBulkMoveToStage}
          onDelete={onBulkDelete}
          onClear={clearSelection}
        />
      ) : (
        // Tiny toolbar above the board with a single bulk expand/
        // collapse toggle. Lives in the slot that BulkActionBar
        // takes when there's a selection — they never coexist, so
        // sharing the row keeps the kanban density unchanged.
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setAllCollapsed(!anyCollapsed)}
            aria-label={anyCollapsed ? "Expandir todas las etapas" : "Colapsar todas las etapas"}
            title={anyCollapsed ? "Expandir todas" : "Colapsar todas"}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-1 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-bg-2 hover:text-foreground"
          >
            {anyCollapsed ? (
              <Maximize2 className="h-3 w-3" />
            ) : (
              <Minimize2 className="h-3 w-3" />
            )}
            {anyCollapsed ? "Expandir todas" : "Colapsar todas"}
          </button>
        </div>
      )}
      {board}
      <DragOverlay>
        {activeCard ? (
          <CardView card={activeCard} dragging workModality={modality} />
        ) : null}
      </DragOverlay>
      <RejectionReasonDialog
        open={pendingReject !== null}
        candidateName={pendingReject?.candidateName ?? ""}
        onCancel={() => {
          // Recruiter backed out — roll the optimistic move back so
          // the card returns to its original column.
          if (!pendingReject) return;
          applyOptimistic({ kind: "revert", cards: pendingReject.snapshot });
          setPendingReject(null);
        }}
        onConfirm={async ({ reasonId, notes }) => {
          if (!pendingReject) return;
          // Finish the move with the picked reason. We can't await
          // inside startTransition + close the modal, so we do the
          // network call inline and clear the pending state on
          // either outcome.
          const res = await moveApplicationToStageAction(
            pendingReject.applicationId,
            pendingReject.targetStageId,
            { rejectionReasonId: reasonId, rejectionNotes: notes },
          );
          if (!res.ok) {
            applyOptimistic({
              kind: "revert",
              cards: pendingReject.snapshot,
            });
          }
          router.refresh();
          setPendingReject(null);
        }}
      />
      <RejectionReasonDialog
        open={pendingBulkReject !== null}
        candidateName={
          pendingBulkReject
            ? `${pendingBulkReject.applicationIds.length} candidato${pendingBulkReject.applicationIds.length === 1 ? "" : "s"}`
            : ""
        }
        onCancel={() => setPendingBulkReject(null)}
        onConfirm={async ({ reasonId, notes }) => {
          if (!pendingBulkReject) return;
          const snap = pendingBulkReject;
          setPendingBulkReject(null);
          commitBulkMove(snap.applicationIds, snap.targetStageId, {
            rejectionReasonId: reasonId,
            rejectionNotes: notes,
          });
        }}
      />
      <ConfirmDialog
        open={pendingBulkDelete !== null}
        onOpenChange={(o) => (!o ? setPendingBulkDelete(null) : null)}
        title={
          pendingBulkDelete
            ? `Eliminar ${pendingBulkDelete.length} ${pendingBulkDelete.length === 1 ? "candidato" : "candidatos"} de la vacante`
            : "Eliminar candidatos"
        }
        description="Se borrarán las aplicaciones a esta vacante. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (!pendingBulkDelete) return;
          const ids = pendingBulkDelete;
          setPendingBulkDelete(null);
          commitBulkDelete(ids);
        }}
      />
    </DndContext>
  );
}

/**
 * Action bar that sits above the kanban whenever any card is
 * checkbox-selected. macOS-Finder-ish vibe: pinned, primary-tinted
 * background, count on the left, action picker on the right.
 *
 * The "Mover a etapa…" trigger uses a native <details> popover to
 * avoid pulling another Radix tree into this already-busy file. Each
 * stage row shows its color dot so the recruiter can tell
 * "Rechazado" from "Hired" at a glance.
 */
function BulkActionBar({
  count,
  stages,
  onMove,
  onDelete,
  onClear,
}: {
  count: number;
  stages: PipelineStageRow[];
  onMove: (stageId: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-bulk-popover]")) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
      <span className="text-xs font-medium text-foreground">
        {count} {count === 1 ? "candidato" : "candidatos"} seleccionado
        {count === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2" data-bulk-popover>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-on-accent hover:bg-accent/90"
          >
            Mover a etapa…
          </button>
          {open ? (
            <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
              <ul className="max-h-72 overflow-y-auto py-1">
                {stages.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onMove(s.id);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: s.color ?? "#94a3b8" }}
                      />
                      <span className="truncate">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Eliminar candidatos"
          title="Eliminar de la vacante"
          className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpiar selección"
          title="Limpiar selección"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Column({
  stage,
  cards,
  workModality,
  collapsed,
  onToggleCollapsed,
  selectedIds,
  onToggleSelected,
  anySelected,
}: {
  stage: PipelineStageRow;
  cards: CardData[];
  workModality: "remote" | "hybrid" | "onsite" | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selectedIds: Set<string>;
  onToggleSelected: (applicationId: string, checked: boolean) => void;
  /** Any card across the board is selected. Forces this column's
   *  checkboxes to be visible (vs the default hover-reveal) so the
   *  recruiter can pick siblings without hunting for the affordance. */
  anySelected: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const stageColor = stage.color ?? "#94a3b8";

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          // Slightly wider (44px) so the bumped vertical label has
          // breathing room without crowding the stage dot + count.
          "flex h-[calc(100vh-280px)] w-11 shrink-0 cursor-pointer flex-col items-center rounded-lg border border-border bg-muted/30 py-2.5 transition-colors hover:bg-muted/60",
          isOver && "bg-muted/70 ring-2 ring-accent/30",
        )}
        onClick={onToggleCollapsed}
        role="button"
        aria-label={`Expandir ${stage.name}`}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: stageColor }}
        />
        <span className="mt-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-fg-muted tabular-nums">
          {cards.length}
        </span>
        {/* Bumped from text-xs (12 px) to text-sm (14 px) + font-
            semibold + tracking-snug + fg-1 text colour so the rotated
            label is legible at a glance. Within brand — sentence
            case, same DM Sans family. */}
        <span
          className="mt-2.5 select-none whitespace-nowrap text-sm font-semibold tracking-[-0.01em] text-fg-1"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {stage.name}
        </span>
        <ChevronsRight className="mt-auto h-3 w-3 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-280px)] w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* Tinted pill carrying the stage name — matches the list
              view's stage cell, so the recruiter sees the same visual
              token in both layouts. Color comes from the stage row; we
              tint the bg at ~13% (hex `22`) so the text stays readable. */}
          <span
            className="inline-flex min-w-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              background: stageColor + "22",
              color: stageColor,
            }}
          >
            <span className="truncate">{stage.name}</span>
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
            {cards.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={`Colapsar ${stage.name}`}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto p-2 transition-colors",
          isOver && "bg-muted/60",
        )}
      >
        <SortableContext items={cards.map((c) => c.application.id)}>
          {cards.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
              Arrastra candidatos aquí
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {cards.map((c) => (
                <SortableCard
                  key={c.application.id}
                  card={c}
                  workModality={workModality}
                  selected={selectedIds.has(c.application.id)}
                  onToggleSelected={onToggleSelected}
                  anySelected={anySelected}
                />
              ))}
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function UnstageColumn({
  cards,
  workModality,
  selectedIds,
  onToggleSelected,
  anySelected,
}: {
  cards: CardData[];
  workModality: "remote" | "hybrid" | "onsite" | null;
  selectedIds: Set<string>;
  onToggleSelected: (applicationId: string, checked: boolean) => void;
  anySelected: boolean;
}) {
  return (
    <div className="flex h-[calc(100vh-280px)] w-72 shrink-0 flex-col rounded-lg border border-dashed border-border bg-muted/10">
      <div className="border-b border-border px-3 py-2 text-sm font-medium text-muted-foreground">
        Sin etapa · {cards.length}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {cards.map((c) => (
            <CardView
              key={c.application.id}
              card={c}
              workModality={workModality}
              selected={selectedIds.has(c.application.id)}
              onToggleSelected={onToggleSelected}
              anySelected={anySelected}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SortableCard({
  card,
  workModality,
  selected,
  onToggleSelected,
  anySelected,
}: {
  card: CardData;
  workModality: "remote" | "hybrid" | "onsite" | null;
  selected: boolean;
  onToggleSelected: (applicationId: string, checked: boolean) => void;
  anySelected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.application.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardView
        card={card}
        dragging={isDragging}
        workModality={workModality}
        selected={selected}
        onToggleSelected={onToggleSelected}
        anySelected={anySelected}
      />
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function avatarColor(name: string): string {
  // Deterministic pleasant color from the name.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 65% 55%)`;
}

const MODALITY_LABEL: Record<"remote" | "hybrid" | "onsite", string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
};
const MODALITY_STYLE: Record<
  "remote" | "hybrid" | "onsite",
  { bg: string; fg: string }
> = {
  remote: { bg: "#cffafe", fg: "#0e7490" },   // teal
  hybrid: { bg: "#fed7aa", fg: "#9a3412" },   // amber
  onsite: { bg: "#e2e8f0", fg: "#475569" },   // gray
};

function ModalityBadge({
  modality,
}: {
  modality: "remote" | "hybrid" | "onsite";
}) {
  const s = MODALITY_STYLE[modality];
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {MODALITY_LABEL[modality]}
    </span>
  );
}

function CardView({
  card,
  dragging,
  workModality,
  selected = false,
  onToggleSelected,
  anySelected = false,
}: {
  card: CardData;
  dragging?: boolean;
  workModality?: "remote" | "hybrid" | "onsite" | null;
  /** Whether this application id is in the bulk-action selection. */
  selected?: boolean;
  /** Selection toggler. Optional because the DragOverlay renders a
   *  stand-alone preview CardView that doesn't need a checkbox. */
  onToggleSelected?: (applicationId: string, checked: boolean) => void;
  /** Any sibling is currently selected — used to keep checkboxes
   *  visible across all cards while the recruiter is picking. */
  anySelected?: boolean;
}) {
  const router = useRouter();
  const c = card.candidate;
  const name = c?.full_name ?? "Sin nombre";
  const checkboxVisible = selected || anySelected;
  return (
    <button
      type="button"
      onClick={(e) => {
        // Avoid opening when this is mid-drag.
        if (dragging) return;
        e.stopPropagation();
        router.push(`?contact=${card.application.id}`, { scroll: false });
      }}
      className={cn(
        "group flex w-full cursor-pointer items-start gap-2 rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-shadow hover:shadow",
        dragging && "cursor-grabbing shadow-lg",
        selected && "border-accent/60 ring-2 ring-accent/20",
      )}
    >
      {onToggleSelected ? (
        // Checkbox lives outside the card's click handler so toggling
        // selection doesn't open the slideover. PointerDown stop is
        // critical — dnd-kit's PointerSensor would otherwise treat
        // the checkbox click as the start of a drag.
        <label
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center transition-opacity",
            checkboxVisible
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) =>
              onToggleSelected(card.application.id, e.target.checked)
            }
            className="h-3.5 w-3.5 accent-accent"
            aria-label="Seleccionar candidato"
          />
        </label>
      ) : null}
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{ background: avatarColor(name) }}
      >
        {initialsOf(name) || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        {c?.email ? (
          <div className="truncate text-xs text-muted-foreground">{c.email}</div>
        ) : c?.linkedin_url ? (
          <div className="truncate text-xs text-muted-foreground">
            {c.linkedin_url.replace(/^https?:\/\//, "")}
          </div>
        ) : null}
        {card.application.ai_status_line ? (
          <p
            className="mt-1 line-clamp-2 text-xs text-foreground/70"
            title={card.application.ai_status_line}
          >
            {card.application.ai_status_line}
          </p>
        ) : null}
        {card.tags.length > 0 || workModality ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {workModality ? <ModalityBadge modality={workModality} /> : null}
            {card.tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="rounded-full px-1.5 py-0.5 text-[10px]"
                style={{
                  background: (t.color ?? "#94a3b8") + "22",
                  color: t.color ?? "#475569",
                }}
              >
                {t.name}
              </span>
            ))}
            {card.tags.length > 3 ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                +{card.tags.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {c?.linkedin_url ? (
        <a
          href={c.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Open LinkedIn"
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </a>
      ) : null}
    </button>
  );
}
