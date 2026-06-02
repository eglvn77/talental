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
import type { RejectionReasonRow } from "@/lib/hiring";
import {
  createRejectionReasonAction,
  deleteRejectionReasonAction,
  reorderRejectionReasonsAction,
  updateRejectionReasonAction,
} from "./actions";

export function RejectionReasonsList({
  initialRows,
}: {
  initialRows: RejectionReasonRow[];
}) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);
  const [, start] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<RejectionReasonRow | null>(
    null,
  );
  const [newName, setNewName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function patchLocal(id: string, patch: Partial<RejectionReasonRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function commitReorder(next: RejectionReasonRow[]) {
    setRows(next);
    start(async () => {
      const res = await reorderRejectionReasonsAction({
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
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    start(async () => {
      const res = await createRejectionReasonAction({ name });
      if (!res.ok) {
        toast.actionFailed(t("rejectionReasonsCfg.createFailed"), res.error);
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
      const res = await deleteRejectionReasonAction({ id });
      if (!res.ok) {
        toast.actionFailed(t("rejectionReasonsCfg.deleteFailed"), res.error);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border">
        <div className="hidden grid-cols-[24px_1fr_28px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
          <span aria-hidden />
          <span>{t("rejectionReasonsCfg.columnName")}</span>
          <span aria-hidden />
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t("rejectionReasonsCfg.empty")}
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
                  <RejectionReasonRowItem
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
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={t("rejectionReasonsCfg.addPlaceholder")}
          className="max-w-xs"
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("rejectionReasonsCfg.add")}
        </button>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("rejectionReasonsCfg.deleteTitle", {
          name: deleteTarget?.name ?? "",
        })}
        description={t("rejectionReasonsCfg.deleteDescription")}
        confirmLabel={t("rejectionReasonsCfg.delete")}
        destructive
        onConfirm={onDeleteConfirmed}
      />
    </div>
  );
}

function RejectionReasonRowItem({
  row,
  t,
  onPatchLocal,
  onDelete,
}: {
  row: RejectionReasonRow;
  t: TFunction;
  onPatchLocal: (patch: Partial<RejectionReasonRow>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [name, setName] = useState(row.name);
  const last = useRef(row.name);
  useEffect(() => {
    setName(row.name);
    last.current = row.name;
  }, [row.name]);
  const [, start] = useTransition();

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === last.current) {
      setName(last.current);
      return;
    }
    last.current = trimmed;
    onPatchLocal({ name: trimmed });
    start(async () => {
      const res = await updateRejectionReasonAction({
        id: row.id,
        name: trimmed,
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_1fr_28px] items-center gap-2 bg-background px-3 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("rejectionReasonsCfg.dragToReorder")}
        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setName(last.current);
            (e.target as HTMLInputElement).blur();
          }
        }}
        maxLength={80}
        className="h-8 text-sm"
      />

      <button
        type="button"
        onClick={onDelete}
        aria-label={t("rejectionReasonsCfg.delete")}
        title={t("rejectionReasonsCfg.delete")}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
