"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type TemplateFormValues = {
  name: string;
  description: string | null;
  isDefault: boolean;
  autoMoveContactedOnOutbound: boolean;
  autoMoveAnsweredOnReply: boolean;
};

export type TemplateFormEditingShape = {
  name: string;
  description: string | null;
  is_default: boolean;
  auto_move_contacted_on_outbound: boolean;
  auto_move_answered_on_reply: boolean;
  /** Set when the editing row is the workspace's current default and
   *  is the only template — admin can't unset in that case. */
  isOnlyTemplate?: boolean;
};

export function TemplateFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: TemplateFormEditingShape | null;
  onSubmit: (v: TemplateFormValues) => Promise<void>;
}) {
  const isEdit = editing !== null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [autoMoveContacted, setAutoMoveContacted] = useState(false);
  const [autoMoveAnswered, setAutoMoveAnswered] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rehydrate from the editing row each time the dialog opens. We do
  // this in an effect rather than initialValues so reopening reflects
  // the latest row (admins can edit twice in a row without a refresh).
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setIsDefault(editing?.is_default ?? false);
    setAutoMoveContacted(editing?.auto_move_contacted_on_outbound ?? false);
    setAutoMoveAnswered(editing?.auto_move_answered_on_reply ?? false);
  }, [open, editing]);

  // Can't unset the default flag when this is the only template —
  // /jobs/new needs at least one default to fall back on.
  const lockDefault = isEdit && editing?.is_default && editing?.isOnlyTemplate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name,
        description: description.trim() || null,
        isDefault,
        autoMoveContactedOnOutbound: autoMoveContacted,
        autoMoveAnsweredOnReply: autoMoveAnswered,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar proceso" : "Nuevo proceso"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="tpl-name" className="text-xs font-medium">
              Nombre
            </label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Headhunting ejecutivo"
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="tpl-desc" className="text-xs font-medium">
              Descripción <span className="text-muted-foreground">(opcional)</span>
            </label>
            <Input
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para vacantes C-suite con búsqueda dedicada"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              disabled={lockDefault}
              className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span>
              <span className="font-medium">Marcar como proceso por defecto</span>
              <span className="block text-muted-foreground">
                Las vacantes nuevas seleccionarán este proceso automáticamente.
                {lockDefault
                  ? " No puedes desmarcarlo porque es el único proceso del workspace."
                  : null}
              </span>
            </span>
          </label>

          <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
            <p className="text-xs font-medium">Automatizaciones</p>
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={autoMoveContacted}
                onChange={(e) => setAutoMoveContacted(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
              />
              <span>
                <span className="font-medium">
                  Mover a &ldquo;Contactado&rdquo; al enviar un mensaje outbound
                </span>
                <span className="block text-muted-foreground">
                  El candidato salta a la primera etapa con categoría
                  &ldquo;contacted&rdquo; al disparar un envío.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={autoMoveAnswered}
                onChange={(e) => setAutoMoveAnswered(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
              />
              <span>
                <span className="font-medium">
                  Mover a &ldquo;Respondió&rdquo; cuando el candidato contesta
                </span>
                <span className="block text-muted-foreground">
                  Aplica a la primera etapa con categoría &ldquo;answered&rdquo;.
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isEdit ? (
                "Guardar"
              ) : (
                "Crear"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
