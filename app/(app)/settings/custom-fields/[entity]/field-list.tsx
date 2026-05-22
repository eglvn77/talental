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
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { CustomFieldDefinitionRow, CustomFieldKind } from "@/lib/hiring";
import { toast } from "@/lib/toast";
import {
  deleteCustomFieldAction,
  reorderCustomFieldsAction,
} from "../../actions";
import { FieldForm } from "./field-form";

const KIND_LABEL: Record<CustomFieldKind, string> = {
  text: "Texto",
  long_text: "Texto largo",
  number: "Número",
  boolean: "Sí / No",
  date: "Fecha",
  select: "Selección única",
  multi_select: "Selección múltiple",
  url: "URL",
  email: "Correo",
};

export function FieldList({
  entity,
  initialFields,
}: {
  entity: string;
  initialFields: CustomFieldDefinitionRow[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinitionRow | null>(null);
  const [confirmTarget, setConfirmTarget] =
    useState<CustomFieldDefinitionRow | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(fields, oldIndex, newIndex);
    setFields(next);
    startTransition(async () => {
      const res = await reorderCustomFieldsAction({
        entityType: entity,
        orderedIds: next.map((f) => f.id),
      });
      if (!res.ok) {
        toast.actionFailed("No se pudo reordenar", res.error);
        setFields(initialFields);
      }
    });
  }

  function onCreate() {
    setEditing(null);
    setOpen(true);
  }

  function onEdit(f: CustomFieldDefinitionRow) {
    setEditing(f);
    setOpen(true);
  }

  function onDelete(f: CustomFieldDefinitionRow) {
    setConfirmTarget(f);
  }

  async function onDeleteConfirmed() {
    if (!confirmTarget) return;
    const id = confirmTarget.id;
    const res = await deleteCustomFieldAction(id);
    if (!res.ok) {
      toast.actionFailed("No se pudo eliminar", res.error);
      return;
    }
    toast.actionOk("Campo eliminado");
    setFields((cur) => cur.filter((x) => x.id !== id));
    setConfirmTarget(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Define columnas adicionales para esta entidad. Arrastra el handle
          para reordenar.
        </p>
        <Button onClick={onCreate} size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Agregar campo
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Aún no hay campos personalizados para esta entidad.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="divide-y divide-border rounded-md border border-border">
              {fields.map((f) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  onEdit={() => onEdit(f)}
                  onDelete={() => onDelete(f)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <FieldForm
        entity={entity}
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={() => router.refresh()}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title={
          confirmTarget
            ? `Eliminar "${confirmTarget.label}"`
            : "Eliminar campo"
        }
        description="Se perderán los valores guardados de este campo en todas las entidades."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDeleteConfirmed}
      />
    </>
  );
}

function FieldRow({
  field,
  onEdit,
  onDelete,
}: {
  field: CustomFieldDefinitionRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground"
        aria-label="Reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{field.label}</span>
          {field.is_required ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              Obligatorio
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{field.key}</span>
          <span className="mx-1.5">·</span>
          <span>{KIND_LABEL[field.kind]}</span>
          {field.description ? (
            <>
              <span className="mx-1.5">·</span>
              <span className="truncate">{field.description}</span>
            </>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Editar"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
        aria-label="Eliminar"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
