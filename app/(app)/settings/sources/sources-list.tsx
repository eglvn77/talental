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
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
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

const PALETTE = [
  "#547030", "#6b7548", "#b87333", "#0a66c2", "#2164f3",
  "#22c55e", "#eab308", "#ef4444", "#14b8a6", "#94a3b8",
];

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
      const res = await reorderSourcesAction({ orderedIds: next.map((r) => r.id) });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  function handleDragEnd(e: DragEndEvent) {
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
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {t("sourcesCfg.empty")}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <SourceRowItem
                  key={r.id}
                  row={r}
                  onPatchLocal={(p) => patchLocal(r.id, p)}
                  onDelete={() => setDeleteTarget(r)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

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
  onPatchLocal,
  onDelete,
}: {
  row: SourceRow;
  onPatchLocal: (patch: Partial<SourceRow>) => void;
  onDelete: () => void;
}) {
  const t = useT();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [label, setLabel] = useState(row.label);
  const last = useRef(row.label);
  useEffect(() => {
    setLabel(row.label);
    last.current = row.label;
  }, [row.label]);
  const [colorOpen, setColorOpen] = useState(false);
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
    setColorOpen(false);
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
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-bg-1 px-2 py-1.5",
        isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={t("sourcesCfg.dragToReorder")}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setColorOpen((v) => !v)}
          aria-label={t("sourcesCfg.color")}
          className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border-1"
          style={{ background: row.color ?? "#94a3b8" }}
        />
        {colorOpen ? (
          <div className="absolute left-0 top-6 z-30 grid grid-cols-5 gap-1.5 rounded-md border border-border bg-background p-2 shadow-dropdown">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => saveColor(c)}
                className="h-4 w-4 rounded-full ring-1 ring-border-1"
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        ) : null}
      </div>

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
        className="h-8 flex-1"
      />

      <button
        type="button"
        onClick={onDelete}
        aria-label={t("sourcesCfg.delete")}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
