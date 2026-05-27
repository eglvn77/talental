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
import { GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { JobStatusRow } from "@/lib/hiring";
import { toast } from "@/lib/toast";
import {
  createWorkspaceJobStatusAction,
  deleteWorkspaceJobStatusAction,
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
  /** jobs count per status_id. Drives the "X vacantes" hint and
   *  the delete-confirm copy. */
  usageCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialStatuses);
  useEffect(() => setRows(initialStatuses), [initialStatuses]);
  const [confirmTarget, setConfirmTarget] = useState<JobStatusRow | null>(null);
  const [, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);

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

  async function onCreate() {
    setCreating(true);
    const res = await createWorkspaceJobStatusAction({
      label: "Nuevo estado",
      color: "#94a3b8",
    });
    setCreating(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo crear", res.error);
      return;
    }
    router.refresh();
  }

  async function onDelete(target: JobStatusRow) {
    const res = await deleteWorkspaceJobStatusAction({ id: target.id });
    setConfirmTarget(null);
    if (!res.ok) {
      toast.actionFailed("No se pudo eliminar", res.error);
      return;
    }
    toast.actionOk("Estado eliminado");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border">
        <div className="hidden grid-cols-[24px_1fr_88px_96px_96px_96px_24px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
          <span aria-hidden />
          <span>Nombre</span>
          <span>Color</span>
          <span title="Si está marcado, la vacante aparece en /careers">
            Abierto
          </span>
          <span title="Marca el estado como terminal/archivado">
            Archivado
          </span>
          <span title="Sólo archivados — el cierre fue una colocación exitosa (para reportes de fill-rate)">
            Exitoso
          </span>
          <span aria-hidden />
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
                  onAskDelete={() => setConfirmTarget(r)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onCreate}
        disabled={creating}
        className="gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar estado
      </Button>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => (!o ? setConfirmTarget(null) : null)}
        title={`Eliminar "${confirmTarget?.label ?? ""}"`}
        description={
          confirmTarget && (usageCounts[confirmTarget.id] ?? 0) > 0
            ? `Hay ${usageCounts[confirmTarget.id]} vacante(s) en este estado. Muévelas a otro antes de eliminar.`
            : "Esta acción no se puede deshacer."
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (confirmTarget) void onDelete(confirmTarget);
        }}
      />
    </div>
  );
}

function Row({
  row,
  usageCount,
  onLocalPatch,
  onAskDelete,
}: {
  row: JobStatusRow;
  usageCount: number;
  onLocalPatch: (p: Partial<JobStatusRow>) => void;
  onAskDelete: () => void;
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

  async function commitFlag(
    field: "is_open" | "is_archived" | "is_filled",
    next: boolean,
  ) {
    const prev = {
      is_open: row.is_open,
      is_archived: row.is_archived,
      is_filled: row.is_filled,
    };
    // Lifecycle constraints — kept in lock-step with the DB CHECKs so
    // the UI never sends an invalid combo:
    //   • is_open + is_archived are mutually exclusive.
    //   • is_filled implies is_archived (an open vacante can't be filled).
    const patch: Partial<JobStatusRow> = { [field]: next };
    if (field === "is_open" && next) {
      patch.is_archived = false;
      patch.is_filled = false;
    }
    if (field === "is_archived") {
      if (next) patch.is_open = false;
      else patch.is_filled = false; // can't stay filled if no longer archived
    }
    if (field === "is_filled" && next) {
      patch.is_archived = true;
      patch.is_open = false;
    }
    onLocalPatch(patch);
    const res = await updateWorkspaceJobStatusAction({
      id: row.id,
      ...patch,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      onLocalPatch(prev);
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_1fr_88px_96px_96px_96px_24px] items-center gap-2 bg-background px-3 py-2"
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

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={row.is_open}
          onChange={(e) => void commitFlag("is_open", e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Abierto
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={row.is_archived}
          onChange={(e) => void commitFlag("is_archived", e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Archivado
      </label>

      <label
        className={
          "flex items-center gap-1.5 text-xs " +
          (row.is_archived
            ? "text-muted-foreground"
            : "cursor-not-allowed text-muted-foreground/40")
        }
        title={
          row.is_archived
            ? "Marca este estado como colocación exitosa (para reportes de fill-rate)."
            : "Requiere 'Archivado' — sólo los estados terminales pueden ser exitosos."
        }
      >
        <input
          type="checkbox"
          checked={row.is_filled}
          disabled={!row.is_archived}
          onChange={(e) => void commitFlag("is_filled", e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Exitoso
      </label>

      {!row.is_system ? (
        <button
          type="button"
          onClick={onAskDelete}
          aria-label="Eliminar estado"
          title={
            usageCount > 0
              ? `${usageCount} vacante(s) usan este estado`
              : "Eliminar"
          }
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span aria-hidden />
      )}
    </li>
  );
}
