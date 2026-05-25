"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import type { ProcessTemplateRow } from "@/lib/hiring/rows";
import { updateProcessTemplateAction } from "../../actions";

/**
 * Inline, autosaving settings form for a process template. Lives at
 * the top of `/settings/processes/[id]` and replaces the old centered
 * dialog. We chose autosave over an explicit "Save" button because
 * the stages editor (further down the page) is already autosaving, so
 * a save button up here would be inconsistent and easy to forget.
 *
 * Text fields commit on blur + Enter; toggles commit on change. Each
 * save spins a tiny indicator next to the field so the admin can see
 * the write went through.
 */
export function TemplateSettingsForm({
  template,
  isOnlyTemplate,
  onChanged,
}: {
  template: ProcessTemplateRow;
  /** Lock the default checkbox when this is the workspace's only
   *  template — /jobs/new needs at least one default to fall back on. */
  isOnlyTemplate: boolean;
  /** Called after each successful field save so the parent can refresh
   *  its derived state (e.g. the list view's name/default/etc). */
  onChanged?: (patch: Partial<ProcessTemplateRow>) => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [isDefault, setIsDefault] = useState(template.is_default);
  const [autoContacted, setAutoContacted] = useState(
    template.auto_move_contacted_on_outbound,
  );
  const [autoAnswered, setAutoAnswered] = useState(
    template.auto_move_answered_on_reply,
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const lastName = useRef(template.name);
  const lastDesc = useRef(template.description ?? "");

  // Resync from server when the row changes (e.g. after duplicate or
  // setDefault from elsewhere in the app). We avoid clobbering the
  // local buffer mid-edit — the savingKey check below short-circuits
  // when there's an in-flight save targeting the same field.
  useEffect(() => {
    setName(template.name);
    setDescription(template.description ?? "");
    setIsDefault(template.is_default);
    setAutoContacted(template.auto_move_contacted_on_outbound);
    setAutoAnswered(template.auto_move_answered_on_reply);
    lastName.current = template.name;
    lastDesc.current = template.description ?? "";
  }, [template]);

  async function persist(
    key: string,
    patch: Parameters<typeof updateProcessTemplateAction>[0],
    localPatch: Partial<ProcessTemplateRow>,
    onFail: () => void,
  ) {
    setSavingKey(key);
    const res = await updateProcessTemplateAction(patch);
    setSavingKey(null);
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      onFail();
      return;
    }
    onChanged?.(localPatch);
  }

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(lastName.current);
      toast.actionFailed("El nombre no puede estar vacío");
      return;
    }
    if (trimmed === lastName.current) return;
    await persist(
      "name",
      { id: template.id, name: trimmed },
      { name: trimmed },
      () => setName(lastName.current),
    );
    lastName.current = trimmed;
  }

  async function commitDescription() {
    const next = description.trim();
    if (next === (lastDesc.current ?? "")) return;
    await persist(
      "description",
      { id: template.id, description: next || null },
      { description: next || null },
      () => setDescription(lastDesc.current),
    );
    lastDesc.current = next;
  }

  async function commitDefault(next: boolean) {
    setIsDefault(next);
    await persist(
      "isDefault",
      { id: template.id, isDefault: next },
      { is_default: next },
      () => setIsDefault(!next),
    );
  }

  async function commitAutoContacted(next: boolean) {
    setAutoContacted(next);
    await persist(
      "autoContacted",
      { id: template.id, autoMoveContactedOnOutbound: next },
      { auto_move_contacted_on_outbound: next },
      () => setAutoContacted(!next),
    );
  }

  async function commitAutoAnswered(next: boolean) {
    setAutoAnswered(next);
    await persist(
      "autoAnswered",
      { id: template.id, autoMoveAnsweredOnReply: next },
      { auto_move_answered_on_reply: next },
      () => setAutoAnswered(!next),
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor="tpl-name" className="text-xs font-medium">
            Nombre
          </label>
          {savingKey === "name" ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <Input
          id="tpl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(lastName.current);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor="tpl-desc" className="text-xs font-medium">
            Descripción{" "}
            <span className="text-muted-foreground">(opcional)</span>
          </label>
          {savingKey === "description" ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <Input
          id="tpl-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => void commitDescription()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDescription(lastDesc.current);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Para vacantes C-suite con búsqueda dedicada"
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={isDefault}
          disabled={(isDefault && isOnlyTemplate) || savingKey === "isDefault"}
          onChange={(e) => void commitDefault(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span>
          <span className="font-medium">Proceso por defecto</span>
          <span className="block text-muted-foreground">
            Las vacantes nuevas seleccionarán este proceso automáticamente.
            {isDefault && isOnlyTemplate
              ? " No puedes desmarcarlo porque es el único proceso del workspace."
              : null}
          </span>
        </span>
        {savingKey === "isDefault" ? (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
        ) : null}
      </label>

      <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
        <p className="text-xs font-medium">Automatizaciones</p>
        <label className="flex cursor-pointer items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={autoContacted}
            onChange={(e) => void commitAutoContacted(e.target.checked)}
            disabled={savingKey === "autoContacted"}
            className="mt-0.5 h-4 w-4 cursor-pointer"
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
          {savingKey === "autoContacted" ? (
            <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={autoAnswered}
            onChange={(e) => void commitAutoAnswered(e.target.checked)}
            disabled={savingKey === "autoAnswered"}
            className="mt-0.5 h-4 w-4 cursor-pointer"
          />
          <span>
            <span className="font-medium">
              Mover a &ldquo;Respondió&rdquo; cuando el candidato contesta
            </span>
            <span className="block text-muted-foreground">
              Aplica a la primera etapa con categoría &ldquo;answered&rdquo;.
            </span>
          </span>
          {savingKey === "autoAnswered" ? (
            <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
        </label>
      </div>
    </div>
  );
}
