"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Linkedin, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { BulkTagsPopover } from "../../_components/bulk-tags-popover";
import { enrichFromLinkedinAction } from "@/app/(app)/_actions/linkedin-enrich";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import {
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import {
  formatRelative,
  SortHeader,
  useTableSort,
} from "../../_components/table-controls";
import {
  bulkDeleteApplicationsAction,
  bulkMoveApplicationsAction,
  moveApplicationToStageAction,
} from "../../actions";
import { RejectionReasonDialog } from "./_components/rejection-reason-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Row = {
  application: ApplicationRow;
  candidate: CandidateRow | null;
  stage: PipelineStageRow | null;
  tags: TagRow[];
};

type SortKey = "name" | "stage" | "source" | "activity";

function sourceLabels(t: TFunction): Record<string, string> {
  return {
    linkedin: "LinkedIn",
    indeed: "Indeed",
    referral: t("jobDetail.sourceReferral"),
    direct: t("jobDetail.sourceDirect"),
    other: t("jobDetail.sourceOther"),
    bulk_import: t("jobDetail.sourceBulkImport"),
  };
}

export function CandidatesListView({
  stages,
  applications,
  candidatesById,
  tagsByApplicationId,
  selectedStageId,
  sourceFilter,
  tagFilter,
  hiddenCols,
}: {
  stages: PipelineStageRow[];
  applications: ApplicationRow[];
  candidatesById: Record<string, CandidateRow>;
  tagsByApplicationId: Record<string, TagRow[]>;
  /**
   * Currently-selected stage id from the parent's <StageChips>, or
   * null for "Todas". The list filters to this single stage.
   */
  selectedStageId: string | null;
  /** Source/Fuente filter — empty Set = no filter. Lives in Vista. */
  sourceFilter: Set<string>;
  /** Tag filter — empty Set = no filter. Lives in Vista. */
  tagFilter: Set<string>;
  /**
   * Set of toggleable column keys currently hidden. Controlled by
   * the parent's <VistaPopover>. Keys: stage / source / tags /
   * activity / email. The "Nombre" column is locked.
   */
  hiddenCols: Set<string>;
}) {
  const router = useRouter();
  const t = useT();
  const [, startTransition] = useTransition();
  const stagesById = useMemo(() => {
    const m = new Map<string, PipelineStageRow>();
    for (const s of stages) m.set(s.id, s);
    return m;
  }, [stages]);

  // Multi-select state for bulk move. Mirrors the kanban: a Set of
  // application ids; clearing on stage filter change so the toolbar
  // doesn't reference invisible rows. The bulk bar shows whenever
  // `selectedIds.size > 0` and disappears after a successful move.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Reset selection whenever the visible row set changes — the
    // user shouldn't carry an off-screen selection into a new view.
    setSelectedIds(new Set());
  }, [selectedStageId, sourceFilter, tagFilter]);

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Pending rejection — when a row gets moved into a rejected-category
  // stage, we stash the move here and pop the reason picker before
  // committing. Both the per-row dropdown and the bulk action route
  // through the same dialog so reasons are consistent.
  const [pendingReject, setPendingReject] = useState<
    | { kind: "single"; applicationId: string; targetStageId: string; candidateName: string }
    | { kind: "bulk"; applicationIds: string[]; targetStageId: string }
    | null
  >(null);

  function commitMove(applicationId: string, targetStageId: string, reason?: { reasonId: string; notes?: string }) {
    startTransition(async () => {
      const res = await moveApplicationToStageAction(applicationId, targetStageId, {
        rejectionReasonId: reason?.reasonId,
        rejectionNotes: reason?.notes,
      });
      if (!res.ok) {
        toast.actionFailed(t("jobDetail.moveFailed"), res.error);
      }
      router.refresh();
    });
  }

  function commitBulkMove(applicationIds: string[], targetStageId: string, reason?: { reasonId: string; notes?: string }) {
    startTransition(async () => {
      const res = await bulkMoveApplicationsAction(applicationIds, targetStageId, {
        rejectionReasonId: reason?.reasonId,
        rejectionNotes: reason?.notes,
      });
      if (!res.ok) {
        toast.actionFailed(t("jobDetail.moveFailed"), res.error);
      } else {
        toast.actionOk(
          applicationIds.length === 1
            ? t("jobDetail.candidatesMovedOne", { count: applicationIds.length })
            : t("jobDetail.candidatesMovedMany", { count: applicationIds.length }),
        );
      }
      clearSelection();
      router.refresh();
    });
  }

  function onPickStageForRow(row: Row, targetStageId: string) {
    if (row.application.stage_id === targetStageId) return;
    const target = stagesById.get(targetStageId);
    if (target?.category === "rejected") {
      const candidateName =
        row.candidate?.full_name ?? row.candidate?.email ?? t("jobDetail.candidateFallback");
      setPendingReject({
        kind: "single",
        applicationId: row.application.id,
        targetStageId,
        candidateName,
      });
      return;
    }
    commitMove(row.application.id, targetStageId);
  }

  function onBulkMove(targetStageId: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const target = stagesById.get(targetStageId);
    if (target?.category === "rejected") {
      setPendingReject({ kind: "bulk", applicationIds: ids, targetStageId });
      return;
    }
    commitBulkMove(ids, targetStageId);
  }

  // Remove the selected candidates from THIS vacante (deletes the
  // applications, never the candidate themselves). One selected row is
  // the individual case; many is the bulk case. Snapshot the ids so the
  // ConfirmDialog acts on the exact set chosen.
  const [pendingBulkDelete, setPendingBulkDelete] = useState<string[] | null>(
    null,
  );

  function onBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setPendingBulkDelete(ids);
  }

  function commitBulkDelete(ids: string[]) {
    startTransition(async () => {
      const res = await bulkDeleteApplicationsAction(ids);
      if (!res.ok) {
        toast.actionFailed(t("jobDetail.deleteFailed"), res.error);
      } else {
        const deleted = res.data?.deleted ?? ids.length;
        toast.actionOk(
          deleted === 1
            ? t("jobDetail.candidatesDeletedOne", { count: deleted })
            : t("jobDetail.candidatesDeletedMany", { count: deleted }),
        );
      }
      clearSelection();
      router.refresh();
    });
  }

  const rows: Row[] = useMemo(
    () =>
      applications.map((a) => ({
        application: a,
        candidate: candidatesById[a.candidate_id] ?? null,
        stage: a.stage_id ? stagesById.get(a.stage_id) ?? null : null,
        tags: tagsByApplicationId[a.id] ?? [],
      })),
    [applications, candidatesById, tagsByApplicationId, stagesById],
  );

  // Filter state lives in the parent (<JobsView>) so it can also
  // render the matching controls inside the Vista popover. We only
  // apply the filters here.

  // Sort state — string keys start ascending; everything else descending.
  const [sort, toggleSort] = useTableSort<SortKey>(
    { key: "activity", dir: "desc" },
    ["name", "source"],
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (selectedStageId != null) {
        if (r.application.stage_id !== selectedStageId) return false;
      }
      if (sourceFilter.size > 0 && !sourceFilter.has(r.application.source)) {
        return false;
      }
      if (tagFilter.size > 0) {
        const has = r.tags.some((t) => tagFilter.has(t.id));
        if (!has) return false;
      }
      return true;
    });
  }, [rows, selectedStageId, sourceFilter, tagFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "name") {
        cmp = (a.candidate?.full_name ?? "").localeCompare(
          b.candidate?.full_name ?? "",
        );
      } else if (sort.key === "stage") {
        const ai = a.stage?.position ?? Infinity;
        const bi = b.stage?.position ?? Infinity;
        cmp = ai - bi;
      } else if (sort.key === "source") {
        cmp = a.application.source.localeCompare(b.application.source);
      } else {
        cmp =
          new Date(a.application.status_changed_at).getTime() -
          new Date(b.application.status_changed_at).getTime();
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  function openCandidate(candidateId: string, applicationId: string) {
    // Stash the currently-rendered candidate-id list so the opened
    // profile shows prev/next + ← / → through the pipeline order.
    // Mirrors the /candidates list pattern (CANDIDATE_NAV_KEY); kept
    // inline here to avoid a cross-route import cycle.
    try {
      sessionStorage.setItem(
        "talental:candidateNav",
        JSON.stringify({
          ids: sorted.map((r) => r.application.candidate_id),
          origin: window.location.pathname,
        }),
      );
    } catch {
      /* sessionStorage unavailable — nav hides */
    }
    router.push(`?candidate=${candidateId}&app=${applicationId}`, {
      scroll: false,
    });
  }

  const allVisibleSelected =
    sorted.length > 0 && sorted.every((r) => selectedIds.has(r.application.id));
  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((cur) => {
        const next = new Set(cur);
        for (const r of sorted) next.delete(r.application.id);
        return next;
      });
    } else {
      setSelectedIds((cur) => {
        const next = new Set(cur);
        for (const r of sorted) next.add(r.application.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-3">
      {selectedIds.size > 0 ? (
        <BulkBar
          count={selectedIds.size}
          stages={stages}
          onMove={onBulkMove}
          onDelete={onBulkDelete}
          onClear={clearSelection}
          selectedCandidateIds={rows
            .filter((r) => selectedIds.has(r.application.id))
            .map((r) => r.application.candidate_id)}
          selectedLinkedinUrls={rows
            .filter((r) => selectedIds.has(r.application.id))
            .map((r) => r.candidate?.linkedin_url)
            .filter((v): v is string => Boolean(v))}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("jobDetail.countOfTotal", {
            shown: sorted.length,
            total: rows.length,
          })}
        </p>
      )}

      {(() => {
        const showStage = !hiddenCols.has("stage");
        const showSource = !hiddenCols.has("source");
        const showTags = !hiddenCols.has("tags");
        const showActivity = !hiddenCols.has("activity");
        const showEmail = !hiddenCols.has("email");
        const colCount =
          1 + // Nombre (locked)
          1 + // checkbox column
          (showStage ? 1 : 0) +
          (showSource ? 1 : 0) +
          (showTags ? 1 : 0) +
          (showActivity ? 1 : 0) +
          (showEmail ? 1 : 0);
        return (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-max text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label={t("jobDetail.selectAll")}
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="h-3.5 w-3.5 cursor-pointer"
                    />
                  </th>
                  <SortHeader
                    label={t("jobDetail.colName")}
                    k="name"
                    state={sort}
                    onToggle={toggleSort}
                  />
                  {showStage ? (
                    <SortHeader
                      label={t("jobDetail.colStage")}
                      k="stage"
                      state={sort}
                      onToggle={toggleSort}
                    />
                  ) : null}
                  {showEmail ? (
                    <th className="px-3 py-2 text-left font-medium">
                      {t("jobDetail.colEmail")}
                    </th>
                  ) : null}
                  {showSource ? (
                    <SortHeader
                      label={t("jobDetail.colSource")}
                      k="source"
                      state={sort}
                      onToggle={toggleSort}
                    />
                  ) : null}
                  {showTags ? (
                    <th className="px-3 py-2 text-left font-medium">
                      {t("jobDetail.colTags")}
                    </th>
                  ) : null}
                  {showActivity ? (
                    <SortHeader
                      label={t("jobDetail.colActivity")}
                      k="activity"
                      state={sort}
                      onToggle={toggleSort}
                    />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="px-3 py-8 text-center text-xs text-muted-foreground"
                    >
                      {t("jobDetail.noCandidatesMatch")}
                    </td>
                  </tr>
                ) : (
                  sorted.map((r) => (
                    <tr
                      key={r.application.id}
                      onClick={(e) => {
                        // Cmd/Ctrl-click toggles selection instead of
                        // opening the slideover — Finder-style multi-pick.
                        if (e.metaKey || e.ctrlKey) {
                          e.preventDefault();
                          toggleSelected(
                            r.application.id,
                            !selectedIds.has(r.application.id),
                          );
                          return;
                        }
                        openCandidate(r.application.candidate_id, r.application.id);
                      }}
                      className={cn(
                        "cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/40",
                        selectedIds.has(r.application.id) && "bg-accent/5",
                      )}
                    >
                      <td
                        className="w-8 px-2 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={t("jobDetail.selectCandidate", {
                            name: r.candidate?.full_name ?? t("jobDetail.candidateFallbackLower"),
                          })}
                          checked={selectedIds.has(r.application.id)}
                          onChange={(e) =>
                            toggleSelected(r.application.id, e.target.checked)
                          }
                          className="h-3.5 w-3.5 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {r.candidate?.full_name ?? t("jobDetail.noName")}
                          {r.candidate?.linkedin_url ? (
                            <a
                              href={r.candidate.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="LinkedIn"
                              title="LinkedIn"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Linkedin className="h-3 w-3" />
                            </a>
                          ) : null}
                        </span>
                        {/* Position + company once enriched. Sits
                            above the email fallback. */}
                        {r.candidate?.current_position || r.candidate?.current_company_name ? (
                          <div className="text-xs font-normal text-muted-foreground">
                            {[
                              r.candidate?.current_position,
                              r.candidate?.current_company_name,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
                        {r.candidate?.email && !showEmail ? (
                          <div className="text-xs font-normal text-muted-foreground">
                            {r.candidate.email}
                          </div>
                        ) : null}
                      </td>
                      {showStage ? (
                        <td
                          className="px-3 py-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <StagePicker
                            stages={stages}
                            currentStageId={r.application.stage_id}
                            onPick={(stageId) => onPickStageForRow(r, stageId)}
                          />
                        </td>
                      ) : null}
                      {showEmail ? (
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {r.candidate?.email ?? "—"}
                        </td>
                      ) : null}
                      {showSource ? (
                        <td className="px-3 py-2 text-xs">
                          {sourceLabels(t)[r.application.source] ??
                            r.application.source}
                        </td>
                      ) : null}
                      {showTags ? (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {r.tags.slice(0, 3).map((t) => (
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
                            {r.tags.length > 3 ? (
                              <span className="text-[10px] text-muted-foreground">
                                +{r.tags.length - 3}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                      {showActivity ? (
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatRelative(r.application.status_changed_at, t)}
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      })()}

      <RejectionReasonDialog
        open={pendingReject !== null}
        candidateName={
          pendingReject?.kind === "single"
            ? pendingReject.candidateName
            : pendingReject
              ? pendingReject.applicationIds.length === 1
                ? t("jobDetail.candidateCountOne", { count: pendingReject.applicationIds.length })
                : t("jobDetail.candidateCountMany", { count: pendingReject.applicationIds.length })
              : ""
        }
        onCancel={() => setPendingReject(null)}
        onConfirm={async ({ reasonId, notes }) => {
          if (!pendingReject) return;
          const snap = pendingReject;
          setPendingReject(null);
          if (snap.kind === "single") {
            commitMove(snap.applicationId, snap.targetStageId, {
              reasonId,
              notes,
            });
          } else {
            commitBulkMove(snap.applicationIds, snap.targetStageId, {
              reasonId,
              notes,
            });
          }
        }}
      />

      <ConfirmDialog
        open={pendingBulkDelete !== null}
        onOpenChange={(o) => (!o ? setPendingBulkDelete(null) : null)}
        title={
          pendingBulkDelete
            ? pendingBulkDelete.length === 1
              ? t("jobDetail.deleteCandidatesTitleOne", {
                  count: pendingBulkDelete.length,
                })
              : t("jobDetail.deleteCandidatesTitleMany", {
                  count: pendingBulkDelete.length,
                })
            : t("jobDetail.deleteCandidatesTitleFallback")
        }
        description={t("jobDetail.deleteCandidatesDescription")}
        confirmLabel={t("jobDetail.delete")}
        destructive
        onConfirm={() => {
          if (!pendingBulkDelete) return;
          const ids = pendingBulkDelete;
          setPendingBulkDelete(null);
          commitBulkDelete(ids);
        }}
      />
    </div>
  );
}

/**
 * Per-row stage picker. Renders the same tinted-pill chip the kanban
 * uses, but clickable: it opens a popover with the workspace's stages
 * so the recruiter can move a candidate without leaving the list. The
 * cell wrapper around it stops row clicks so picking a stage doesn't
 * also open the candidate slideover.
 */
function StagePicker({
  stages,
  currentStageId,
  onPick,
}: {
  stages: PipelineStageRow[];
  currentStageId: string | null;
  onPick: (stageId: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const current = stages.find((s) => s.id === currentStageId) ?? null;
  const color = current?.color ?? "#94a3b8";

  // Outside-click close — small popover, no Radix needed.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-stage-picker]")) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative inline-block" data-stage-picker>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80"
        style={{
          background: color + "22",
          color,
        }}
      >
        <span className="truncate">{current?.name ?? t("jobDetail.noStage")}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
          <ul className="max-h-72 overflow-y-auto py-1">
            {stages.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (s.id !== currentStageId) onPick(s.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted",
                    s.id === currentStageId && "bg-muted/60",
                  )}
                >
                  <span
                    aria-hidden
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
  );
}

/**
 * Bulk-move toolbar that replaces the "N de M" counter while there's
 * a selection. Mirrors the kanban's BulkActionBar but lighter — the
 * list view doesn't have a reject affordance separate from the move
 * itself (a rejected-category stage opens the reason picker).
 */
function BulkBar({
  count,
  stages,
  onMove,
  onDelete,
  onClear,
  selectedCandidateIds,
  selectedLinkedinUrls,
}: {
  count: number;
  stages: PipelineStageRow[];
  onMove: (stageId: string) => void;
  onDelete: () => void;
  onClear: () => void;
  /** Candidate ids for the bulk Tags add/remove flow. */
  selectedCandidateIds: string[];
  /** LinkedIn URLs of selected rows that actually have one — empty
   *  when nobody in the selection has a URL. */
  selectedLinkedinUrls: string[];
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);

  async function onBulkEnrich() {
    if (enriching || selectedLinkedinUrls.length === 0) return;
    setEnriching(true);
    // Same action the top-of-profile 'Enrich with AI' button calls.
    // Already supports bulk (up to 25 URLs per request) under the
    // hood, so no looping.
    const res = await enrichFromLinkedinAction({ urls: selectedLinkedinUrls });
    setEnriching(false);
    if (!res.ok) {
      toast.actionFailed("Enrich", res.error);
      return;
    }
    const ok = res.data.results.filter(
      (r) => r.kind === "created" || r.kind === "reused",
    ).length;
    const fail = res.data.results.length - ok;
    if (fail === 0) toast.actionOk(`Enriched ${ok}`);
    else toast.actionFailed("Enrich", `${ok} ok, ${fail} failed`);
    router.refresh();
  }
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
    <div className="flex items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
      <span className="text-xs font-medium text-foreground">
        {count === 1
          ? t("jobDetail.selectedOne", { count })
          : t("jobDetail.selectedMany", { count })}
      </span>
      <div className="flex items-center gap-2" data-bulk-popover>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-fg-on-accent hover:bg-accent/90"
          >
            {t("jobDetail.moveToStage")}
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
                        aria-hidden
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
        <BulkTagsPopover
          entityType="candidate"
          selectedIds={new Set(selectedCandidateIds)}
          onDone={() => router.refresh()}
        />
        <button
          type="button"
          onClick={onBulkEnrich}
          disabled={enriching || selectedLinkedinUrls.length === 0}
          aria-label="Enrich selected from LinkedIn"
          title="Enrich selected from LinkedIn"
          className="btn-ai inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50"
        >
          {enriching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Enrich
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("jobDetail.deleteCandidates")}
          title={t("jobDetail.deleteFromJob")}
          className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("jobDetail.delete")}
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label={t("jobDetail.clearSelection")}
          title={t("jobDetail.clearSelection")}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
