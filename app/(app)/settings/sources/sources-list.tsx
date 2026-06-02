"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import type { SourceRow } from "@/lib/hiring";
import type { SourceScope } from "@/lib/sources";
import {
  createSourceAction,
  deleteSourceAction,
  reorderSourcesAction,
  updateSourceAction,
} from "./actions";

export function SourcesList({
  scope,
  initialSources,
}: {
  scope: SourceScope;
  initialSources: SourceRow[];
}) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState(initialSources);
  useEffect(() => setRows(initialSources), [initialSources]);
  const [, start] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<SourceRow | null>(null);
  const [newLabel, setNewLabel] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function patchLocal(id: string, patch: Partial<SourceRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function commitReorder(next: SourceRow[]) {
    setRows(next);
    start(async () => {
      const res = await reorderSourcesAction({
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

  function onAdd() {
    const label = newLabel.trim();
    if (!label) return;
    setNewLabel("");
    start(async () => {
      const res = await createSourceAction({ scope, label });
      if (!res.ok) {
        toast.actionFailed(t("sourcesCfg.createFailed"), res.error);
        return;
      }
      router.refresh();
    });
  }

  function onDeleteConfirmed() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setRows((cur) => cur.filter((r) => r.id !== id));
    start(async () => {
      const res = await deleteSourceAction({ id });
      if (!res.ok) {
        toast.actionFailed(t("sourcesCfg.deleteFailed"), res.error);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border">
        <div className="hidden grid-cols-[24px_1fr_88px_28px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
          <span aria-hidden />
          <span>{t("jobStatusesCfg.columnName")}</span>
          <span>{t("jobStatusesCfg.columnColor")}</span>
          <span aria-hidden />
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t("sourcesCfg.empty")}
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
                  <SourceRowItem
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

      <div className="flex items-center gap-2">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={t("sourcesCfg.addPlaceholder")}
          className="max-w-xs"
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("sourcesCfg.add")}
        </button>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("sourcesCfg.deleteTitle", { name: deleteTarget?.label ?? "" })}
        description={t("sourcesCfg.deleteDescription")}
        confirmLabel={t("sourcesCfg.delete")}
        destructive
        onConfirm={onDeleteConfirmed}
      />
    </div>
  );
}

function SourceRowItem({
  row,
  t,
  onPatchLocal,
  onDelete,
}: {
  row: SourceRow;
  t: TFunction;
  onPatchLocal: (patch: Partial<SourceRow>) => void;
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
      const res = await updateSourceAction({ id: row.id, label: trimmed });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  function saveColor(color: string) {
    onPatchLocal({ color });
    start(async () => {
      const res = await updateSourceAction({ id: row.id, color });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_1fr_88px_28px] items-center gap-2 bg-background px-3 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("sourcesCfg.dragToReorder")}
        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: row.color ?? "#94a3b8" }}
        />
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
          maxLength={40}
          className="h-8 text-sm"
        />
      </div>

      <input
        type="color"
        value={row.color ?? "#94a3b8"}
        onChange={(e) => saveColor(e.target.value)}
        aria-label={t("sourcesCfg.color")}
        className="h-7 w-12 cursor-pointer rounded-md border border-border bg-background p-0.5"
      />

      <button
        type="button"
        onClick={onDelete}
        aria-label={t("sourcesCfg.delete")}
        title={t("sourcesCfg.delete")}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
