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
import { GripVertical, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { JobStatusRow } from "@/lib/hiring";

/**
 * Lifecycle category. We expose this single concept to the admin
 * instead of the three underlying flags (is_open, is_archived,
 * is_filled) — easier to reason about. The flags stay in the DB
 * because reports + careers filters + template propagation need
 * them; this UI just maps the picked category to all three at once.
 */
type Behavior = "draft" | "open" | "closed_won" | "closed_lost";

const BEHAVIOR_LABEL: Record<Behavior, string> = {
  draft: "Borrador (en preparación)",
  open: "Búsqueda activa",
  closed_won: "Cerrada — con éxito",
  closed_lost: "Cerrada — sin éxito",
};

function flagsToBehavior(row: {
  is_open: boolean;
  is_archived: boolean;
  is_filled: boolean;
}): Behavior {
  if (row.is_open) return "open";
  if (row.is_archived && row.is_filled) return "closed_won";
  if (row.is_archived) return "closed_lost";
  return "draft";
}

import { toast } from "@/lib/toast";
import {
  reorderWorkspaceJobStatusesAction,
  updateWorkspaceJobStatusAction,
} from "../../actions";

/**
 * Workspace job-statuses manager. Renders the workspace's rows as a
 * drag-reorderable list. Each row has inline editors for label, color,
 * and the two behavior flags (is_open / is_archived). System rows
 * carry a small lock icon and skip the delete button.
 *
 * Pattern mirrors stages-editor.tsx: optimistic local state + per-
 * field server commit + rollback on failure. The list re-syncs from
 * the server prop when the page revalidates so router.refresh keeps
 * everything coherent after mutations.
 */
export function JobStatusesList({
  initialStatuses,
  usageCounts,
}: {
  initialStatuses: JobStatusRow[];
  /** jobs count per status_id. Display-only hint after each row. */
  usageCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialStatuses);
  useEffect(() => setRows(initialStatuses), [initialStatuses]);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function applyLocalPatch(id: string, patch: Partial<JobStatusRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function commitReorder(next: JobStatusRow[]) {
    setRows(next);
    startTransition(async () => {
      const res = await reorderWorkspaceJobStatusesAction({
        orderedIds: next.map((r) => r.id),
      });
      if (!res.ok) {
        toast.actionFailed("No se pudo reordenar", res.error);
      }
      router.refresh();
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    commitReorder(arrayMove(rows, oldIndex, newIndex));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border">
        <div className="hidden grid-cols-[24px_1fr_88px_minmax(220px,1fr)] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
          <span aria-hidden />
          <span>Nombre</span>
          <span>Color</span>
          <span title="Qué hace el sistema con las vacantes en este estado">
            Comportamiento
          </span>
        </div>
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
                <Row
                  key={r.id}
                  row={r}
                  usageCount={usageCounts[r.id] ?? 0}
                  onLocalPatch={(p) => applyLocalPatch(r.id, p)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function Row({
  row,
  usageCount,
  onLocalPatch,
}: {
  row: JobStatusRow;
  usageCount: number;
  onLocalPatch: (p: Partial<JobStatusRow>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Local name buffer so the input doesn't fight server state mid-type.
  const [name, setName] = useState(row.label);
  useEffect(() => setName(row.label), [row.label]);
  const lastSavedName = useRef(row.label);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(lastSavedName.current);
      toast.actionFailed("El nombre no puede estar vacío");
      return;
    }
    if (trimmed === lastSavedName.current) return;
    const res = await updateWorkspaceJobStatusAction({
      id: row.id,
      label: trimmed,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      setName(lastSavedName.current);
      return;
    }
    lastSavedName.current = trimmed;
    onLocalPatch({ label: trimmed });
  }

  async function commitColor(next: string) {
    const prev = row.color;
    onLocalPatch({ color: next });
    const res = await updateWorkspaceJobStatusAction({
      id: row.id,
      color: next,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      onLocalPatch({ color: prev });
    }
  }

  const behavior = flagsToBehavior(row);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_1fr_88px_minmax(220px,1fr)] items-center gap-2 bg-background px-3 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reordenar"
        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(lastSavedName.current);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 text-sm"
        />
        {row.is_system ? (
          <span
            title="Estado de sistema — no se puede eliminar, pero se puede renombrar"
            className="inline-flex shrink-0 items-center text-muted-foreground"
          >
            <Lock className="h-3 w-3" />
          </span>
        ) : null}
      </div>

      <input
        type="color"
        value={row.color ?? "#94a3b8"}
        onChange={(e) => void commitColor(e.target.value)}
        aria-label="Color"
        className="h-7 w-12 cursor-pointer rounded-md border border-border bg-background p-0.5"
      />

      <span
        title={`${usageCount} ${usageCount === 1 ? "vacante" : "vacantes"} en este estado`}
        className="text-xs text-muted-foreground"
      >
        {BEHAVIOR_LABEL[behavior]}
      </span>
    </li>
  );
}
