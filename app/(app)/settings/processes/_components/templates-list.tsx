"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import {
  createProcessTemplateAction,
  deleteProcessTemplateAction,
  duplicateProcessTemplateAction,
  updateProcessTemplateAction,
} from "../../actions";
import {
  TemplateFormDialog,
  type TemplateFormValues,
} from "./template-form-dialog";

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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateListItem | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TemplateListItem | null>(
    null,
  );
  const [, startTransition] = useTransition();

  function refresh() {
    router.refresh();
  }

  async function onCreateSubmit(v: TemplateFormValues) {
    const res = await createProcessTemplateAction({
      name: v.name,
      description: v.description,
      isDefault: v.isDefault,
      autoMoveContactedOnOutbound: v.autoMoveContactedOnOutbound,
      autoMoveAnsweredOnReply: v.autoMoveAnsweredOnReply,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo crear", res.error);
      return;
    }
    toast.actionOk("Proceso creado");
    // Jump straight into the new template's stage editor — empty
    // templates aren't useful, the next thing you'll do is add stages.
    router.push(`/settings/processes/${res.data.id}`);
  }

  async function onEditSubmit(v: TemplateFormValues) {
    if (!editing) return;
    const res = await updateProcessTemplateAction({
      id: editing.id,
      name: v.name,
      description: v.description,
      isDefault: v.isDefault,
      autoMoveContactedOnOutbound: v.autoMoveContactedOnOutbound,
      autoMoveAnsweredOnReply: v.autoMoveAnsweredOnReply,
    });
    if (!res.ok) {
      toast.actionFailed("No se pudo actualizar", res.error);
      return;
    }
    toast.actionOk("Proceso actualizado");
    setTemplates((cur) =>
      cur.map((t) =>
        t.id === editing.id
          ? {
              ...t,
              name: v.name,
              description: v.description,
              is_default: v.isDefault,
              auto_move_contacted_on_outbound: v.autoMoveContactedOnOutbound,
              auto_move_answered_on_reply: v.autoMoveAnsweredOnReply,
            }
          : v.isDefault
            ? // If the admin promoted this template, the others can no
              // longer be marked default — reflect that in local state.
              { ...t, is_default: false }
            : t,
      ),
    );
    setEditing(null);
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
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
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
                  <Link
                    href={`/settings/processes/${t.id}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
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
                onClick={() => {
                  setEditing(t);
                  setOpen(true);
                }}
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
                className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
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

      <TemplateFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        editing={
          editing
            ? {
                name: editing.name,
                description: editing.description,
                is_default: editing.is_default,
                auto_move_contacted_on_outbound:
                  editing.auto_move_contacted_on_outbound,
                auto_move_answered_on_reply:
                  editing.auto_move_answered_on_reply,
                isOnlyTemplate: templates.length === 1,
              }
            : null
        }
        onSubmit={editing ? onEditSubmit : onCreateSubmit}
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
