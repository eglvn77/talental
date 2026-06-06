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
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
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
import type { ResourceDefinitionRow } from "@/lib/hiring";
import {
  createResourceDefinitionAction,
  deleteResourceDefinitionAction,
  renameResourceDefinitionAction,
  reorderResourceDefinitionsAction,
  toggleResourceDefinitionEnabledAction,
} from "./actions";

/**
 * Resource definitions list. Sorted by `position`. Each row exposes:
 *   - drag handle to reorder (commits on drop)
 *   - editable label (commits on blur / Enter)
 *   - enable toggle
 *   - kind chip (read-only)
 *   - lock icon on system rows
 * No add/delete in this first cut.
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
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] =
    useState<"markdown" | "list" | "structured" | "checklist">("markdown");

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
    const key = newKey.trim().toLowerCase();
    const label = newLabel.trim();
    if (!key || !label) return;
    start(async () => {
      const res = await createResourceDefinitionAction({
        key,
        label,
        kind: newKind,
      });
      if (!res.ok) {
        toast.actionFailed(t("resourcesCfg.createFailed"), res.error);
        return;
      }
      setNewKey("");
      setNewLabel("");
      setNewKind("markdown");
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

  return (
    <div className="space-y-3">
    <div className="overflow-hidden rounded-md border border-border">
      <div className="hidden grid-cols-[24px_minmax(0,1fr)_100px_90px_70px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
        <span aria-hidden />
        <span>{t("resourcesCfg.columnLabel")}</span>
        <span>{t("resourcesCfg.columnKey")}</span>
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
                  onPatchLocal={(p) => patchLocal(r.id, p)}
                  onDelete={() => setDeleteTarget(r)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>

    {/* Create custom resource. Three inline inputs — keep it small;
        rare action, not worth a modal. */}
    <div className="rounded-md border border-dashed border-border p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("resourcesCfg.createTitle")}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)_120px_auto]">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder={t("resourcesCfg.createKeyPlaceholder")}
          className="h-8 font-mono text-xs"
        />
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
          onChange={(e) =>
            setNewKind(e.target.value as typeof newKind)
          }
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="markdown">markdown</option>
          <option value="list">list</option>
          <option value="structured">structured</option>
          <option value="checklist">checklist</option>
        </select>
        <button
          type="button"
          onClick={onCreate}
          disabled={!newKey.trim() || !newLabel.trim()}
          className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
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
  onPatchLocal,
  onDelete,
}: {
  row: ResourceDefinitionRow;
  t: TFunction;
  onPatchLocal: (patch: Partial<ResourceDefinitionRow>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [label, setLabel] = useState(row.label);
  const last = useRef(row.label);
  useEffect(() => {
    setLabel(row.label);
    last.current = row.label;
  }, [row.label]);
  const [, start] = useTransition();

  function saveLabel() {
    const trimmed = label.trim();
    if (!trimmed || trimmed === last.current) {
      setLabel(last.current);
      return;
    }
    last.current = trimmed;
    onPatchLocal({ label: trimmed });
    start(async () => {
      const res = await renameResourceDefinitionAction({
        id: row.id,
        label: trimmed,
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

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_minmax(0,1fr)_100px_90px_70px] items-center gap-2 bg-background px-3 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("resourcesCfg.dragToReorder")}
        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={saveLabel}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setLabel(last.current);
              (e.target as HTMLInputElement).blur();
            }
          }}
          maxLength={80}
          className="h-8 text-sm"
        />
        {row.kind === "checklist" ? (
          <Link
            href={`/settings/resources/${row.key}`}
            title={t("resourcesCfg.openEditor")}
            aria-label={t("resourcesCfg.openEditor")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        {row.is_system ? (
          <span
            title={t("resourcesCfg.systemLockTitle")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground"
          >
            <Lock className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>

      <code className="truncate font-mono text-[11px] text-muted-foreground">
        {row.key}
      </code>

      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {row.kind}
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
    </li>
  );
}
