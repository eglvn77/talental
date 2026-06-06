"use client";

import { useState, useTransition } from "react";
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
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { updateCustomResourceValueAction } from "../_actions/resource-values";

/**
 * Generic editors for custom (non-system) resource_definitions.
 * Each kind has its own component — keeps the rendering layer simple
 * and avoids "schema-driven form" complexity until we actually need
 * kind='structured' (which lands later).
 */

/* --- kind='markdown' --------------------------------------------- */

export function MarkdownResourceEditor({
  jobId,
  definitionId,
  initial,
}: {
  jobId: string;
  definitionId: string;
  initial: string;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [, start] = useTransition();

  function persist() {
    start(async () => {
      const res = await updateCustomResourceValueAction({
        jobId,
        definitionId,
        value,
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={persist}
      placeholder={t("kickoff.scriptPlaceholder")}
      rows={20}
      className="w-full resize-y rounded-md border border-border bg-bg-1 p-3 font-mono text-xs leading-relaxed text-foreground"
    />
  );
}

/* --- kind='list' ------------------------------------------------- */

type ListRow = { _id: string; value: string };

function uid(): string {
  return crypto.randomUUID();
}

export function ListResourceEditor({
  jobId,
  definitionId,
  initial,
}: {
  jobId: string;
  definitionId: string;
  initial: string[];
}) {
  const t = useT();
  const [rows, setRows] = useState<ListRow[]>(() =>
    initial.map((v) => ({ _id: uid(), value: v })),
  );
  const [, start] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function persist(next: ListRow[]) {
    setRows(next);
    start(async () => {
      const res = await updateCustomResourceValueAction({
        jobId,
        definitionId,
        value: next.map((r) => r.value),
      });
      if (!res.ok) toast.saveFailed(res.error);
    });
  }

  function patch(id: string, value: string) {
    setRows((cur) =>
      cur.map((r) => (r._id === id ? { ...r, value } : r)),
    );
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = rows.findIndex((r) => r._id === active.id);
    const newI = rows.findIndex((r) => r._id === over.id);
    if (oldI < 0 || newI < 0) return;
    persist(arrayMove(rows, oldI, newI));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {t("kickoff.listEmpty")}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r._id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {rows.map((row) => (
                <ListRowItem
                  key={row._id}
                  row={row}
                  onChange={(v) => patch(row._id, v)}
                  onCommit={() => persist(rows)}
                  onDelete={() =>
                    persist(rows.filter((r) => r._id !== row._id))
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <button
        type="button"
        onClick={() =>
          setRows((cur) => [...cur, { _id: uid(), value: "" }])
        }
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        {t("kickoff.addItem")}
      </button>
    </div>
  );
}

function ListRowItem({
  row,
  onChange,
  onCommit,
  onDelete,
}: {
  row: ListRow;
  onChange: (v: string) => void;
  onCommit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row._id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_minmax(0,1fr)_28px] items-center gap-2 rounded bg-background px-2 py-1"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("kickoff.dragToReorder")}
        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Input
        value={row.value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter")
            (e.target as HTMLInputElement).blur();
        }}
        className="h-8 text-sm"
      />
      <button
        type="button"
        onClick={onDelete}
        aria-label={t("kickoff.remove")}
        title={t("kickoff.remove")}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
