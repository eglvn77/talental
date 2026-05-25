"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import {
  createProcessTemplateAction,
  deleteProcessTemplateAction,
  duplicateProcessTemplateAction,
} from "../../actions";
import { EditTemplateDialog } from "./edit-template-dialog";
import {
  TemplateCreateDialog,
  type TemplateCreateValues,
} from "./template-create-dialog";

export type TemplateListItem = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  auto_move_contacted_on_outbound: boolean;
  auto_move_answered_on_reply: boolean;
  stage_count: number;
};

export function TemplatesList({
  initialTemplates,
}: {
  initialTemplates: TemplateListItem[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TemplateListItem | null>(
    null,
  );
  const [, startTransition] = useTransition();

  function refresh() {
    router.refresh();
  }

  async function onCreateSubmit(v: TemplateCreateValues) {
    const res = await createProcessTemplateAction({
      name: v.name,
      description: v.description,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo crear", res.error);
      return;
    }
    toast.actionOk("Proceso creado");
    // Jump straight into the new template's edit dialog — empty
    // templates aren't useful, the next thing you'll do is add stages.
    setEditingId(res.data.id);
    refresh();
  }

  function onDuplicate(t: TemplateListItem) {
    startTransition(async () => {
      const res = await duplicateProcessTemplateAction({ id: t.id });
      if (!res.ok) {
        toast.actionFailed("No se pudo duplicar", res.error);
        return;
      }
      toast.actionOk("Proceso duplicado");
      refresh();
    });
  }

  async function onDeleteConfirmed() {
    if (!confirmTarget) return;
    const res = await deleteProcessTemplateAction({ id: confirmTarget.id });
    if (!res.ok) {
      toast.actionFailed("No se pudo eliminar", res.error);
      return;
    }
    toast.actionOk("Proceso eliminado");
    setTemplates((cur) => cur.filter((x) => x.id !== confirmTarget.id));
    setConfirmTarget(null);
    refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo proceso
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Aún no hay procesos. Crea uno para empezar.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(t.id)}
                    className="truncate text-left text-sm font-medium hover:underline"
                  >
                    {t.name}
                  </button>
                  {t.is_default ? (
                    <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      Por defecto
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.stage_count} {t.stage_count === 1 ? "etapa" : "etapas"}
                  {t.description ? (
                    <>
                      <span className="mx-1.5">·</span>
                      <span className="truncate">{t.description}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDuplicate(t)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Duplicar"
                aria-label="Duplicar"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setEditingId(t.id)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Editar proceso"
                aria-label="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmTarget(t)}
                disabled={t.is_default}
                className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                title={
                  t.is_default
                    ? "No puedes eliminar el proceso por defecto"
                    : "Eliminar"
                }
                aria-label="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <TemplateCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={onCreateSubmit}
      />

      <EditTemplateDialog
        templateId={editingId}
        onOpenChange={(o) => {
          if (!o) setEditingId(null);
        }}
        onClosed={refresh}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title={
          confirmTarget
            ? `Eliminar "${confirmTarget.name}"`
            : "Eliminar proceso"
        }
        description="Las vacantes que ya usan este proceso conservan sus etapas (son copias). Esta acción solo borra la plantilla."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDeleteConfirmed}
      />
    </>
  );
}
