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
import { ExternalLink, GripVertical, Lock } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import type { ResourceDefinitionRow } from "@/lib/hiring";
import {
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
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);
  const [, start] = useTransition();

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

  return (
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
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function ResourceRowItem({
  row,
  t,
  onPatchLocal,
}: {
  row: ResourceDefinitionRow;
  t: TFunction;
  onPatchLocal: (patch: Partial<ResourceDefinitionRow>) => void;
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

      <div className="flex justify-end">
        <input
          type="checkbox"
          checked={row.is_enabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
          aria-label={t("resourcesCfg.columnEnabled")}
          className="h-4 w-4 cursor-pointer rounded border-border"
        />
      </div>
    </li>
  );
}
