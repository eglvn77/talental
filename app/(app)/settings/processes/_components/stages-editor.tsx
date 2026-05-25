"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
// Direct submodule imports — pulling these from @/lib/hiring would
// drag clients.ts into the client bundle (see the server-only fence).
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
} from "@/lib/hiring/defaults";
import {
  isTerminalCategory,
  type PipelineCategory,
} from "@/lib/hiring/enums";
import type { ProcessTemplateStageRow } from "@/lib/hiring/rows";
import { toast } from "@/lib/toast";
import {
  createProcessTemplateStageAction,
  deleteProcessTemplateStageAction,
  reorderProcessTemplateStagesAction,
  updateProcessTemplateStageAction,
} from "../../actions";

export function StagesEditor({
  templateId,
  initialStages,
  /**
   * Called after a successful mutation. The parent (settings dialog)
   * uses this to keep the stage_count in its list view fresh. Optional
   * — when omitted, this editor manages its own optimistic state and
   * doesn't talk to the router.
   */
  onChanged,
}: {
  templateId: string;
  initialStages: ProcessTemplateStageRow[];
  onChanged?: () => void;
}) {
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
      } else {
        onChanged?.();
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
    // New stages default to category 'screen' (Llamada Inicial). The
    // server inserts at position 0 — we mirror that locally so the
    // admin's new card lands at the top of the visible list without
    // waiting for a refresh.
    const res = await createProcessTemplateStageAction({
      templateId,
      name: "Nueva etapa",
      category: "screen",
      color: CATEGORY_COLOR.screen,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo crear", res.error);
      return;
    }
    setStages((cur) => [
      res.data.stage,
      ...cur.map((s) => ({ ...s, position: s.position + 1 })),
    ]);
    onChanged?.();
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
    onChanged?.();
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          El nombre es libre; la categoría se elige de un catálogo fijo
          para que los analytics agrupen etapas equivalentes entre
          vacantes.
        </p>
        <Button onClick={onCreate} size="sm" className="shrink-0 gap-1">
          <Plus className="h-3.5 w-3.5" />
          Nueva etapa
        </Button>
      </div>

      {stages.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
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
              {stages.map((s, i) => (
                <StageCard
                  key={s.id}
                  stage={s}
                  templateId={templateId}
                  canMoveUp={i > 0}
                  canMoveDown={i < stages.length - 1}
                  onMoveUp={() => commitReorder(arrayMove(stages, i, i - 1))}
                  onMoveDown={() => commitReorder(arrayMove(stages, i, i + 1))}
                  onDelete={() => setConfirmTarget(s)}
                  onLocalPatch={(patch) => {
                    applyLocalPatch(s.id, patch);
                    onChanged?.();
                  }}
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
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDelete,
  onLocalPatch,
}: {
  stage: ProcessTemplateStageRow;
  templateId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
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

  // Local name buffer so the input doesn't fight the parent list while
  // the admin is mid-typing. Saved on blur and on Enter.
  const [name, setName] = useState(stage.name);
  useEffect(() => setName(stage.name), [stage.name]);
  const lastSavedName = useRef(stage.name);

  const isTerminal = isTerminalCategory(stage.category);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
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
    // Auto-sync the color tint to the category's default when the
    // current color matches the previous category's default (i.e. the
    // admin hasn't set a custom override). Keeps the palette consistent
    // without clobbering an intentional pick.
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

  async function commitClientPortalVisible(next: boolean) {
    const prev = stage.client_portal_visible;
    onLocalPatch({ client_portal_visible: next });
    const res = await updateProcessTemplateStageAction({
      id: stage.id,
      templateId,
      clientPortalVisible: next,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      onLocalPatch({ client_portal_visible: prev });
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-border bg-bg-1 px-3 py-3"
    >
      <div className="flex items-start gap-3">
        {/* Drag handle + keyboard-friendly arrows. PointerSensor needs
            a real drag for the grip; the arrows are the fallback for
            keyboard, mobile, and screen-reader users. */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Subir etapa"
            title="Subir"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground"
            aria-label="Reordenar"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Bajar etapa"
            title="Bajar"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <label className="relative mt-0.5 inline-flex h-5 w-5 cursor-pointer items-center justify-center">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full ring-2 ring-border"
            style={{ background: stage.color }}
          />
          {/* Invisible color input covering the swatch — clicking the
              dot opens the OS picker. Cleaner than a separate slot. */}
          <input
            type="color"
            value={stage.color}
            onChange={(e) => void commitColor(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Color"
          />
        </label>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
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
              className="h-8 flex-1"
            />
            {isTerminal ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                title="Esta categoría siempre cierra el proceso del candidato"
              >
                <Lock className="h-2.5 w-2.5" />
                Terminal
              </span>
            ) : null}
          </div>
          <select
            value={stage.category}
            onChange={(e) =>
              void commitCategory(e.target.value as PipelineCategory)
            }
            className="h-8 w-full rounded-md border border-border bg-bg-1 px-2 text-xs"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>

          <label className="inline-flex cursor-pointer items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={stage.client_portal_visible}
              onChange={(e) =>
                void commitClientPortalVisible(e.target.checked)
              }
              className="h-3 w-3 cursor-pointer accent-accent"
            />
            <span title="Mostrar esta etapa al cliente en el portal externo">
              Visible al cliente
            </span>
          </label>
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
