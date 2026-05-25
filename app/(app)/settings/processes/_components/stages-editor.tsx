"use client";

import { useEffect, useState, useTransition } from "react";
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
import {
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  CATEGORY_COLOR,
  type PipelineCategory,
  type ProcessTemplateStageRow,
} from "@/lib/hiring";
import { toast } from "@/lib/toast";
import {
  createProcessTemplateStageAction,
  deleteProcessTemplateStageAction,
  reorderProcessTemplateStagesAction,
  updateProcessTemplateStageAction,
} from "../../actions";

// Spanish-labeled categories with their default tint. Kept in this
// order so admins see the natural funnel top-to-bottom in the picker.
const CATEGORIES: Array<{ value: PipelineCategory; label: string }> = [
  { value: "sourced", label: "Sourceados" },
  { value: "contacted", label: "Contactados" },
  { value: "answered", label: "Respondieron" },
  { value: "applied", label: "Aplicaron" },
  { value: "screening", label: "Screening" },
  { value: "submitted", label: "Enviados a empresa" },
  { value: "interview", label: "Entrevistas" },
  { value: "offer", label: "Oferta" },
  { value: "hired", label: "Contratado" },
  { value: "rejected", label: "Rechazado" },
  { value: "withdrawn", label: "Declinó" },
];
const CATEGORY_LABEL: Record<PipelineCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
) as Record<PipelineCategory, string>;

export function StagesEditor({
  templateId,
  initialStages,
}: {
  templateId: string;
  initialStages: ProcessTemplateStageRow[];
}) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);
  useEffect(() => setStages(initialStages), [initialStages]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] =
    useState<ProcessTemplateStageRow | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(stages, oldIndex, newIndex);
    setStages(next);
    startTransition(async () => {
      const res = await reorderProcessTemplateStagesAction({
        templateId,
        orderedIds: next.map((s) => s.id),
      });
      if (!res.ok) {
        toast.actionFailed("No se pudo reordenar", res.error);
        setStages(initialStages);
      }
    });
  }

  async function onCreate() {
    // Default new stages to "screening" with its palette color — it's the
    // most common slot to add new stuff into, and the admin can pick a
    // different category from the inline editor right away.
    const res = await createProcessTemplateStageAction({
      templateId,
      name: "Nueva etapa",
      category: "screening",
      color: CATEGORY_COLOR.screening,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo crear", res.error);
      return;
    }
    // Optimistically open the new stage in edit mode so the admin can
    // rename it without a second click.
    setEditingId(res.data.id);
    router.refresh();
  }

  async function onDeleteConfirmed() {
    if (!confirmTarget) return;
    const res = await deleteProcessTemplateStageAction({
      id: confirmTarget.id,
      templateId,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo eliminar", res.error);
      return;
    }
    toast.actionOk("Etapa eliminada");
    setStages((cur) => cur.filter((x) => x.id !== confirmTarget.id));
    setConfirmTarget(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Define las etapas del pipeline. Arrastra el handle para reordenar.
          Las etapas terminales cierran al candidato; las visibles para
          cliente se muestran en el portal externo.
        </p>
        <Button onClick={onCreate} size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Nueva etapa
        </Button>
      </div>

      {stages.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Aún no hay etapas. Crea la primera para empezar.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={stages.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="divide-y divide-border rounded-md border border-border">
              {stages.map((s) => (
                <StageRow
                  key={s.id}
                  stage={s}
                  templateId={templateId}
                  isEditing={editingId === s.id}
                  onStartEdit={() => setEditingId(s.id)}
                  onFinishEdit={() => setEditingId(null)}
                  onDelete={() => setConfirmTarget(s)}
                  onLocalUpdate={(patch) =>
                    setStages((cur) =>
                      cur.map((x) => (x.id === s.id ? { ...x, ...patch } : x)),
                    )
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title={
          confirmTarget
            ? `Eliminar etapa "${confirmTarget.name}"`
            : "Eliminar etapa"
        }
        description="Esto no afecta vacantes existentes. Solo se elimina la etapa de la plantilla."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDeleteConfirmed}
      />
    </>
  );
}

function StageRow({
  stage,
  templateId,
  isEditing,
  onStartEdit,
  onFinishEdit,
  onDelete,
  onLocalUpdate,
}: {
  stage: ProcessTemplateStageRow;
  templateId: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onDelete: () => void;
  onLocalUpdate: (patch: Partial<ProcessTemplateStageRow>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [name, setName] = useState(stage.name);
  const [category, setCategory] = useState<PipelineCategory>(stage.category);
  const [color, setColor] = useState(stage.color);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setName(stage.name);
      setCategory(stage.category);
      setColor(stage.color);
    }
  }, [isEditing, stage.name, stage.category, stage.color]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.actionFailed("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    const res = await updateProcessTemplateStageAction({
      id: stage.id,
      templateId,
      name: trimmed,
      category,
      color,
    });
    setSaving(false);
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      return;
    }
    onLocalUpdate({ name: trimmed, category, color });
    onFinishEdit();
  }

  async function toggleFlag(key: "is_terminal" | "client_portal_visible") {
    const next = !stage[key];
    const res = await updateProcessTemplateStageAction({
      id: stage.id,
      templateId,
      ...(key === "is_terminal"
        ? { isTerminal: next }
        : { clientPortalVisible: next }),
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo actualizar", res.error);
      return;
    }
    onLocalUpdate({ [key]: next } as Partial<ProcessTemplateStageRow>);
  }

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

      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />

      {isEditing ? (
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="h-8 w-44"
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") onFinishEdit();
            }}
          />
          <select
            value={category}
            onChange={(e) => {
              const next = e.target.value as PipelineCategory;
              setCategory(next);
              // Auto-sync the color tint when the category changes so
              // pickers don't drift away from the funnel palette unless
              // the admin actively overrides it via the color input.
              setColor(CATEGORY_COLOR[next]);
            }}
            className="h-8 rounded-md border border-border bg-bg-1 px-2 text-xs"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
            aria-label="Color"
          />
          <Button size="sm" onClick={save} disabled={saving} className="gap-1">
            <Check className="h-3.5 w-3.5" />
            Guardar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onFinishEdit}
            disabled={saving}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{stage.name}</span>
            {stage.is_terminal ? (
              <span className="inline-flex items-center gap-1 rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Lock className="h-2.5 w-2.5" />
                Terminal
              </span>
            ) : null}
            {stage.client_portal_visible ? (
              <span className="inline-flex items-center gap-1 rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">
                <Eye className="h-2.5 w-2.5" />
                Cliente
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {CATEGORY_LABEL[stage.category]}
          </div>
        </div>
      )}

      {!isEditing ? (
        <>
          <button
            type="button"
            onClick={() => toggleFlag("client_portal_visible")}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={
              stage.client_portal_visible
                ? "Ocultar al cliente"
                : "Mostrar al cliente"
            }
            aria-label="Toggle cliente"
          >
            {stage.client_portal_visible ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => toggleFlag("is_terminal")}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={stage.is_terminal ? "Quitar terminal" : "Marcar terminal"}
            aria-label="Toggle terminal"
          >
            <Lock className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onStartEdit}
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
        </>
      ) : null}
    </li>
  );
}
