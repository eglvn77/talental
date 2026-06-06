"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type { JobRequirements } from "@/lib/hiring";
import { updateJobAction } from "@/app/(app)/actions";

type Bucket = "must" | "nice";
type Row = { _id: string; text: string };

function uid(): string {
  return crypto.randomUUID();
}

/**
 * Requirements editor. Two stacked sections — imprescindibles
 * (must-haves) on top, deseables (nice-to-haves) below — each full-width
 * so long requirements read across the whole row. A single drag context
 * spans both sections, so a requirement can be dragged from one section
 * into the other (or reordered within a section). Up/down arrows and a
 * swap button cover the same moves without a mouse.
 */
export function RequirementsEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: JobRequirements;
}) {
  const t = useT();
  const [must, setMust] = useState<Row[]>(() =>
    (initial.must ?? []).map((text) => ({ _id: uid(), text })),
  );
  const [nice, setNice] = useState<Row[]>(() =>
    (initial.nice ?? []).map((text) => ({ _id: uid(), text })),
  );
  const [, start] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Debounce server writes — both the swap button + the textarea's
  // onBlur fire on click (focus moves off the textarea when the user
  // hits ↕), so naively saving twice was racing two updateJobAction
  // calls and intermittently surfacing a 500 (Vercel E352). Coalesce
  // into one save per 200 ms with the latest state.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ must: Row[]; nice: Row[] }>({ must, nice });

  function persist(nextMust: Row[], nextNice: Row[]) {
    setMust(nextMust);
    setNice(nextNice);
    latest.current = { must: nextMust, nice: nextNice };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      start(async () => {
        try {
          const res = await updateJobAction({
            jobId,
            requirements: {
              must: latest.current.must.map((r) => r.text.trim()).filter(Boolean),
              nice: latest.current.nice.map((r) => r.text.trim()).filter(Boolean),
            },
          });
          if (!res.ok) toast.saveFailed(res.error);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.saveFailed(msg.slice(0, 200));
        }
      });
    }, 200);
  }

  function bucketOf(id: string): Bucket | null {
    if (id === "bucket:must") return "must";
    if (id === "bucket:nice") return "nice";
    if (must.some((r) => r._id === id)) return "must";
    if (nice.some((r) => r._id === id)) return "nice";
    return null;
  }

  function listFor(b: Bucket) {
    return b === "must" ? must : nice;
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = bucketOf(String(active.id));
    const to = bucketOf(String(over.id));
    if (!from || !to) return;

    const fromList = listFor(from);
    const item = fromList.find((r) => r._id === active.id);
    if (!item) return;

    if (from === to) {
      const list = fromList;
      const oldI = list.findIndex((r) => r._id === active.id);
      const newI =
        over.id === `bucket:${to}`
          ? list.length - 1
          : list.findIndex((r) => r._id === over.id);
      if (oldI < 0 || newI < 0 || oldI === newI) return;
      const moved = arrayMove(list, oldI, newI);
      if (from === "must") persist(moved, nice);
      else persist(must, moved);
      return;
    }

    // Cross-bucket move.
    const nextFrom = fromList.filter((r) => r._id !== active.id);
    const toList = listFor(to);
    const insertAt =
      over.id === `bucket:${to}`
        ? toList.length
        : Math.max(0, toList.findIndex((r) => r._id === over.id));
    const nextTo = [...toList];
    nextTo.splice(insertAt, 0, item);
    if (from === "must") persist(nextFrom, nextTo);
    else persist(nextTo, nextFrom);
  }

  function patch(b: Bucket, id: string, text: string) {
    const setter = b === "must" ? setMust : setNice;
    setter((cur) => cur.map((r) => (r._id === id ? { ...r, text } : r)));
  }

  function addRow(b: Bucket) {
    const setter = b === "must" ? setMust : setNice;
    setter((cur) => [...cur, { _id: uid(), text: "" }]);
  }

  function removeRow(b: Bucket, id: string) {
    if (b === "must") persist(must.filter((r) => r._id !== id), nice);
    else persist(must, nice.filter((r) => r._id !== id));
  }

  function moveWithin(b: Bucket, index: number, dir: -1 | 1) {
    const list = listFor(b);
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const moved = arrayMove(list, index, j);
    if (b === "must") persist(moved, nice);
    else persist(must, moved);
  }

  function swapBucket(b: Bucket, id: string) {
    const item = listFor(b).find((r) => r._id === id);
    if (!item) return;
    if (b === "must") persist(must.filter((r) => r._id !== id), [...nice, item]);
    else persist([...must, item], nice.filter((r) => r._id !== id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-8">
        <Section
          bucket="must"
          title={t("jobSubtabs.requirementsMustTitle")}
          placeholder={t("jobSubtabs.requirementsMustPlaceholder")}
          rows={must}
          onPatch={patch}
          onPersist={() => persist(must, nice)}
          onRemove={removeRow}
          onAdd={() => addRow("must")}
          onMove={moveWithin}
          onSwap={swapBucket}
        />
        <Section
          bucket="nice"
          title={t("jobSubtabs.requirementsNiceTitle")}
          placeholder={t("jobSubtabs.requirementsNicePlaceholder")}
          rows={nice}
          onPatch={patch}
          onPersist={() => persist(must, nice)}
          onRemove={removeRow}
          onAdd={() => addRow("nice")}
          onMove={moveWithin}
          onSwap={swapBucket}
        />
      </div>
    </DndContext>
  );
}

function Section({
  bucket,
  title,
  placeholder,
  rows,
  onPatch,
  onPersist,
  onRemove,
  onAdd,
  onMove,
  onSwap,
}: {
  bucket: Bucket;
  title: string;
  placeholder: string;
  rows: Row[];
  onPatch: (b: Bucket, id: string, text: string) => void;
  onPersist: () => void;
  onRemove: (b: Bucket, id: string) => void;
  onAdd: () => void;
  onMove: (b: Bucket, index: number, dir: -1 | 1) => void;
  onSwap: (b: Bucket, id: string) => void;
}) {
  const t = useT();
  // Droppable container so an item can be dropped into an empty section
  // (no sortable items to land on).
  const { setNodeRef, isOver } = useDroppable({ id: `bucket:${bucket}` });

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <SortableContext
        items={rows.map((r) => r._id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={cn(
            "min-h-[44px] space-y-2 rounded-md",
            isOver && "bg-accent-soft/30 ring-1 ring-accent/30",
          )}
        >
          {rows.map((r, i) => (
            <SortableRow
              key={r._id}
              row={r}
              placeholder={placeholder}
              canUp={i > 0}
              canDown={i < rows.length - 1}
              onChange={(v) => onPatch(bucket, r._id, v)}
              onCommit={onPersist}
              onUp={() => onMove(bucket, i, -1)}
              onDown={() => onMove(bucket, i, 1)}
              onRemove={() => onRemove(bucket, r._id)}
              onSwap={() => onSwap(bucket, r._id)}
              swapLabel={
                bucket === "must"
                  ? t("jobSubtabs.requirementsNiceTitle")
                  : t("jobSubtabs.requirementsMustTitle")
              }
            />
          ))}
        </ul>
      </SortableContext>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        {t("jobSubtabs.add")}
      </button>
    </div>
  );
}

function SortableRow({
  row,
  placeholder,
  canUp,
  canDown,
  onChange,
  onCommit,
  onUp,
  onDown,
  onRemove,
  onSwap,
  swapLabel,
}: {
  row: Row;
  placeholder: string;
  canUp: boolean;
  canDown: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  onSwap: () => void;
  swapLabel: string;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row._id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1",
        isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        aria-label={t("kickoff.dragToReorder")}
        title={t("kickoff.dragToReorder")}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <textarea
        value={row.text}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        rows={1}
        className="min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-snug focus:outline-none focus:ring-0"
      />
      {/* Inline actions on the right — visible by default, lose
          contrast so they don't crowd the text. Single horizontal row
          keeps the bullet at ~32px tall instead of the old ~80px. */}
      <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground/60">
        <button
          type="button"
          onClick={onUp}
          disabled={!canUp}
          aria-label={t("kickoff.moveUp")}
          title={t("kickoff.moveUp")}
          className="rounded p-1 hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={!canDown}
          aria-label={t("kickoff.moveDown")}
          title={t("kickoff.moveDown")}
          className="rounded p-1 hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onSwap}
          aria-label={swapLabel}
          title={swapLabel}
          className="rounded p-1 hover:bg-muted hover:text-foreground"
        >
          <ArrowDownUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("kickoff.remove")}
          title={t("kickoff.remove")}
          className="rounded p-1 hover:bg-muted hover:text-danger"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}
