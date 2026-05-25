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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
// Import directly from the type-only / value-only submodules instead of
// the @/lib/hiring barrel — the barrel pulls in lib/hiring/clients.ts,
// which depends on next/headers and so can't be loaded inside a Client
// Component bundle.
import { CATEGORY_COLOR } from "@/lib/hiring/defaults";
import type { PipelineCategory } from "@/lib/hiring/enums";
import type { ProcessTemplateStageRow } from "@/lib/hiring/rows";
import { toast } from "@/lib/toast";
import {
  createProcessTemplateStageAction,
  deleteProcessTemplateStageAction,
  reorderProcessTemplateStagesAction,
  updateProcessTemplateStageAction,
} from "../../actions";

// Spanish-labeled categories with their default tint. Order matches
// the natural funnel so the dropdown reads top-to-bottom.
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
  const [confirmTarget, setConfirmTarget] =
    useState<ProcessTemplateStageRow | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function applyLocalPatch(
    id: string,
    patch: Partial<ProcessTemplateStageRow>,
  ) {
    setStages((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function commitReorder(next: ProcessTemplateStageRow[]) {
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

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    commitReorder(arrayMove(stages, oldIndex, newIndex));
  }

  async function onCreate() {
    // New stages default to category 'screening' with its palette color
    // — it's the most common bucket to drop a fresh stage into. The
    // admin can change category right after, since the dropdown is
    // always visible on the card.
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
          El nombre es libre. La categoría es fija (sirve para que los
          analytics agrupen etapas equivalentes entre vacantes — &ldquo;Entrevista
          1&rdquo; y &ldquo;Entrevista 2&rdquo; pueden ambas pertenecer a
          la categoría &ldquo;Entrevistas&rdquo;).
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
            <ul className="space-y-2">
              {stages.map((s) => (
                <StageCard
                  key={s.id}
                  stage={s}
                  templateId={templateId}
                  onDelete={() => setConfirmTarget(s)}
                  onLocalPatch={(patch) => applyLocalPatch(s.id, patch)}
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

function StageCard({
  stage,
  templateId,
  onDelete,
  onLocalPatch,
}: {
  stage: ProcessTemplateStageRow;
  templateId: string;
  onDelete: () => void;
  onLocalPatch: (patch: Partial<ProcessTemplateStageRow>) => void;
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

  // Local name buffer so the input doesn't fight router refreshes
  // while the admin is mid-typing. Saved on blur and on Enter.
  const [name, setName] = useState(stage.name);
  useEffect(() => setName(stage.name), [stage.name]);
  const lastSavedName = useRef(stage.name);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      // Revert — empty names aren't allowed and would also trip the
      // server validation. Better to bounce locally and tell the user.
      setName(lastSavedName.current);
      toast.actionFailed("El nombre no puede estar vacío");
      return;
    }
    if (trimmed === lastSavedName.current) return;
    const res = await updateProcessTemplateStageAction({
      id: stage.id,
      templateId,
      name: trimmed,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      setName(lastSavedName.current);
      return;
    }
    lastSavedName.current = trimmed;
    onLocalPatch({ name: trimmed });
  }

  async function commitCategory(next: PipelineCategory) {
    const prevCategory = stage.category;
    const prevColor = stage.color;
    // Optimistically also swap the color tint to the category's default
    // unless the admin has set a custom color already (we treat "matches
    // current category default" as "no custom override").
    const nextColor =
      stage.color === CATEGORY_COLOR[prevCategory]
        ? CATEGORY_COLOR[next]
        : stage.color;
    onLocalPatch({ category: next, color: nextColor });
    const res = await updateProcessTemplateStageAction({
      id: stage.id,
      templateId,
      category: next,
      color: nextColor,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      onLocalPatch({ category: prevCategory, color: prevColor });
    }
  }

  async function commitFlag(
    key: "is_terminal" | "client_portal_visible",
    next: boolean,
  ) {
    const prev = stage[key];
    onLocalPatch({ [key]: next } as Partial<ProcessTemplateStageRow>);
    const res = await updateProcessTemplateStageAction({
      id: stage.id,
      templateId,
      ...(key === "is_terminal"
        ? { isTerminal: next }
        : { clientPortalVisible: next }),
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      onLocalPatch({ [key]: prev } as Partial<ProcessTemplateStageRow>);
    }
  }

  async function commitColor(next: string) {
    const prev = stage.color;
    onLocalPatch({ color: next });
    const res = await updateProcessTemplateStageAction({
      id: stage.id,
      templateId,
      color: next,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      onLocalPatch({ color: prev });
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-border bg-bg-1 px-3 py-3"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab text-muted-foreground hover:text-foreground"
          aria-label="Reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <label className="relative mt-0.5 inline-flex h-5 w-5 cursor-pointer items-center justify-center">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full ring-2 ring-border"
            style={{ background: stage.color }}
          />
          {/* The native color input is invisible but covers the swatch so
              clicking the dot opens the OS picker. Cleaner than a
              separate color slot crowding the row. */}
          <input
            type="color"
            value={stage.color}
            onChange={(e) => commitColor(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Color"
          />
        </label>

        <div className="flex-1 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") {
                setName(lastSavedName.current);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-8"
          />
          <select
            value={stage.category}
            onChange={(e) =>
              void commitCategory(e.target.value as PipelineCategory)
            }
            className="h-8 w-full rounded-md border border-border bg-bg-1 px-2 text-xs"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] text-muted-foreground">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={stage.is_terminal}
                onChange={(e) => void commitFlag("is_terminal", e.target.checked)}
                className="h-3 w-3 cursor-pointer accent-accent"
              />
              <span title="Cuando un candidato cae en esta etapa, el proceso se cierra para él">
                Terminal
              </span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={stage.client_portal_visible}
                onChange={(e) =>
                  void commitFlag("client_portal_visible", e.target.checked)
                }
                className="h-3 w-3 cursor-pointer accent-accent"
              />
              <span title="Mostrar esta etapa al cliente en el portal externo">
                Visible al cliente
              </span>
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="mt-1 rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
          aria-label="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
