"use client";

import { useEffect, useState, useTransition } from "react";
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
import type { CustomFieldDefinitionRow } from "@/lib/hiring";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  deleteCustomFieldAction,
  reorderCustomFieldsAction,
} from "../../actions";
import { FieldForm } from "./field-form";

export function FieldList({
  entity,
  initialFields,
}: {
  entity: string;
  initialFields: CustomFieldDefinitionRow[];
}) {
  const t = useT();
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  // Keep local state in sync with the server-fetched list — without
  // this, calling router.refresh() after create/edit re-runs the
  // server component with fresh data, but the local copy here
  // (seeded by useState) never picks it up, so the new field stays
  // invisible until a hard reload.
  useEffect(() => {
    setFields(initialFields);
  }, [initialFields]);
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
        toast.actionFailed(t("customFieldsCfg.reorderFailed"), res.error);
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
      toast.actionFailed(t("customFieldsCfg.deleteFailed"), res.error);
      return;
    }
    toast.actionOk(t("customFieldsCfg.toastDeleted"));
    setFields((cur) => cur.filter((x) => x.id !== id));
    setConfirmTarget(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t("customFieldsCfg.intro")}
        </p>
        <Button onClick={onCreate} size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          {t("customFieldsCfg.newField")}
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("customFieldsCfg.empty")}
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
            ? t("customFieldsCfg.confirmDeleteTitle", {
                label: confirmTarget.label,
              })
            : t("customFieldsCfg.confirmDeleteTitleFallback")
        }
        description={t("customFieldsCfg.confirmDeleteDescription")}
        confirmLabel={t("customFieldsCfg.delete")}
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
  const t = useT();
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
        aria-label={t("customFieldsCfg.reorder")}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{field.label}</span>
          {field.is_required ? (
            <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
              {t("customFieldsCfg.badgeRequired")}
            </span>
          ) : null}
          {field.is_filterable ? (
            <span className="rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">
              {t("customFieldsCfg.badgeFilterable")}
            </span>
          ) : null}
          {field.is_visible_in_columns ? (
            <span className="rounded bg-positive-soft px-1.5 py-0.5 text-[10px] font-medium text-positive">
              {t("customFieldsCfg.badgeColumn")}
            </span>
          ) : null}
          {field.show_in_postings ? (
            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {t("customFieldsCfg.badgePosting")}
            </span>
          ) : null}
          {field.is_system ? (
            <span
              className="rounded bg-bg-3 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title={t("customFieldsCfg.systemFieldTooltip")}
            >
              {t("customFieldsCfg.badgeSystem")}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{field.key}</span>
          <span className="mx-1.5">·</span>
          <span>{t(`customFieldsCfg.kind.${field.kind}`)}</span>
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
        aria-label={t("customFieldsCfg.edit")}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {/* System-managed fields (role_type, assessment_link) hide the
          delete affordance — the server action rejects deletion of
          these anyway, but surfacing a button that always errors is
          worse than not surfacing it. */}
      {field.is_system ? null : (
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
          aria-label={t("customFieldsCfg.delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
