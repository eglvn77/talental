"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ResourceDefinitionRow } from "@/lib/hiring";
import {
  createResourceDefinitionAction,
  deleteResourceDefinitionAction,
  renameResourceDefinitionAction,
  reorderResourceDefinitionsAction,
  toggleResourceDefinitionEnabledAction,
  updateResourceDefinitionPromptAction,
} from "./actions";

type Kind = "markdown" | "list" | "structured" | "checklist";

/**
 * /settings/resources list + create form. Phase 4a-ii UX redesign:
 *  - Create form drops the slug input (auto-derived from label).
 *  - Kind options use plain-language labels via i18n.
 *  - Inline "what should the AI generate?" textarea is the centerpiece
 *    of the create flow; empty = manual-only section.
 *  - Existing rows expand inline to reveal an editable AI prompt
 *    textarea + Type chip + (system rows only) lock hint. Label stays
 *    editable for everyone.
 */
export function ResourcesList({
  initialRows,
}: {
  initialRows: ResourceDefinitionRow[];
}) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);
  const [, start] = useTransition();
  const [deleteTarget, setDeleteTarget] =
    useState<ResourceDefinitionRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<Kind>("markdown");
  const [newPrompt, setNewPrompt] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function patchLocal(id: string, patch: Partial<ResourceDefinitionRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function commitReorder(next: ResourceDefinitionRow[]) {
    setRows(next);
    start(async () => {
      const res = await reorderResourceDefinitionsAction({
        orderedIds: next.map((r) => r.id),
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = rows.findIndex((r) => r.id === active.id);
    const newI = rows.findIndex((r) => r.id === over.id);
    if (oldI < 0 || newI < 0) return;
    commitReorder(arrayMove(rows, oldI, newI));
  }

  function onCreate() {
    const label = newLabel.trim();
    if (!label) return;
    start(async () => {
      const res = await createResourceDefinitionAction({
        label,
        kind: newKind,
        generatorPrompt: newPrompt.trim() || undefined,
      });
      if (!res.ok) {
        toast.actionFailed(t("resourcesCfg.createFailed"), res.error);
        return;
      }
      setNewLabel("");
      setNewKind("markdown");
      setNewPrompt("");
      router.refresh();
    });
  }

  function onDeleteConfirmed() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setRows((cur) => cur.filter((r) => r.id !== id));
    start(async () => {
      const res = await deleteResourceDefinitionAction({ id });
      if (!res.ok) {
        toast.actionFailed(t("resourcesCfg.deleteFailed"), res.error);
        router.refresh();
      }
    });
  }

  function toggleRowExpanded(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border">
        <div className="hidden grid-cols-[24px_24px_minmax(0,1fr)_90px_70px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
          <span aria-hidden />
          <span aria-hidden />
          <span>{t("resourcesCfg.columnLabel")}</span>
          <span>{t("resourcesCfg.columnKind")}</span>
          <span className="text-right">{t("resourcesCfg.columnEnabled")}</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t("resourcesCfg.empty")}
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={rows.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <ResourceRowItem
                    key={r.id}
                    row={r}
                    t={t}
                    expanded={expanded.has(r.id)}
                    onToggleExpand={() => toggleRowExpanded(r.id)}
                    onPatchLocal={(p) => patchLocal(r.id, p)}
                    onDelete={() => setDeleteTarget(r)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Create custom section. */}
      <div className="rounded-md border border-dashed border-border p-3 space-y-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("resourcesCfg.createTitle")}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t("resourcesCfg.createLabelPlaceholder")}
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCreate();
              }
            }}
          />
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as Kind)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="markdown">
              {t("resourcesCfg.kindMarkdown")}
            </option>
            <option value="list">{t("resourcesCfg.kindList")}</option>
            <option value="checklist">
              {t("resourcesCfg.kindChecklist")}
            </option>
            <option value="structured">
              {t("resourcesCfg.kindStructured")}
            </option>
          </select>
        </div>
        <textarea
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          placeholder={t("resourcesCfg.createPromptPlaceholder")}
          rows={3}
          className="w-full resize-y rounded-md border border-border bg-background p-2 text-xs leading-relaxed"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCreate}
            disabled={!newLabel.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("resourcesCfg.create")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("resourcesCfg.deleteTitle", {
          label: deleteTarget?.label ?? "",
        })}
        description={t("resourcesCfg.deleteDescription")}
        confirmLabel={t("resourcesCfg.delete")}
        destructive
        onConfirm={onDeleteConfirmed}
      />
    </div>
  );
}

function ResourceRowItem({
  row,
  t,
  expanded,
  onToggleExpand,
  onPatchLocal,
  onDelete,
}: {
  row: ResourceDefinitionRow;
  t: TFunction;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatchLocal: (patch: Partial<ResourceDefinitionRow>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [label, setLabel] = useState(row.label);
  const labelLast = useRef(row.label);
  const [prompt, setPrompt] = useState(row.generator_prompt ?? "");
  const promptLast = useRef(row.generator_prompt ?? "");
  useEffect(() => {
    setLabel(row.label);
    labelLast.current = row.label;
    setPrompt(row.generator_prompt ?? "");
    promptLast.current = row.generator_prompt ?? "";
  }, [row.label, row.generator_prompt]);
  const [, start] = useTransition();

  function saveLabel() {
    const trimmed = label.trim();
    if (!trimmed || trimmed === labelLast.current) {
      setLabel(labelLast.current);
      return;
    }
    labelLast.current = trimmed;
    onPatchLocal({ label: trimmed });
    start(async () => {
      const res = await renameResourceDefinitionAction({
        id: row.id,
        label: trimmed,
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  function savePrompt() {
    const value = prompt; // textarea — preserve internal whitespace
    if (value === promptLast.current) return;
    promptLast.current = value;
    onPatchLocal({ generator_prompt: value });
    start(async () => {
      const res = await updateResourceDefinitionPromptAction({
        id: row.id,
        generatorPrompt: value,
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  function toggleEnabled(next: boolean) {
    onPatchLocal({ is_enabled: next });
    start(async () => {
      const res = await toggleResourceDefinitionEnabledAction({
        id: row.id,
        isEnabled: next,
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  const kindLabel = (() => {
    switch (row.kind) {
      case "markdown":
        return t("resourcesCfg.kindMarkdown");
      case "list":
        return t("resourcesCfg.kindList");
      case "structured":
        return t("resourcesCfg.kindStructured");
      case "checklist":
        return t("resourcesCfg.kindChecklist");
      case "sequence":
        return t("resourcesCfg.kindSequence");
      default:
        return row.kind;
    }
  })();

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-background",
        expanded && "bg-muted/30",
      )}
    >
      <div className="grid grid-cols-[24px_24px_minmax(0,1fr)_90px_70px] items-center gap-2 px-3 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("resourcesCfg.dragToReorder")}
          className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={
            expanded
              ? t("resourcesCfg.collapseRow")
              : t("resourcesCfg.expandRow")
          }
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="flex min-w-0 items-center gap-1.5">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setLabel(labelLast.current);
                (e.target as HTMLInputElement).blur();
              }
            }}
            maxLength={80}
            className="h-8 text-sm"
          />
          {row.is_system ? (
            <span
              title={t("resourcesCfg.systemLockTitle")}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground"
            >
              <Lock className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
        <span className="truncate text-[11px] text-muted-foreground">
          {kindLabel}
        </span>
        <div className="flex items-center justify-end gap-1">
          <input
            type="checkbox"
            checked={row.is_enabled}
            onChange={(e) => toggleEnabled(e.target.checked)}
            aria-label={t("resourcesCfg.columnEnabled")}
            className="h-4 w-4 cursor-pointer rounded border-border"
          />
          {!row.is_system ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={t("resourcesCfg.delete")}
              title={t("resourcesCfg.delete")}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="space-y-2 border-t border-border bg-bg-1 px-3 py-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("resourcesCfg.aiPromptLabel")}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("resourcesCfg.aiPromptHint")}
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={savePrompt}
            placeholder={t("resourcesCfg.aiPromptPlaceholder")}
            rows={6}
            className="w-full resize-y rounded-md border border-border bg-background p-2 text-xs leading-relaxed"
          />
        </div>
      ) : null}
    </li>
  );
}
