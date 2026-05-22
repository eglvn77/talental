"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PromptRow } from "@/lib/hiring";
import { AVAILABLE_MODELS } from "@/lib/models";
import {
  deletePromptAction,
  resetPromptToDefaultAction,
  updatePromptAction,
} from "../../actions";

export function PromptEditor({ prompt }: { prompt: PromptRow }) {
  const router = useRouter();
  const [body, setBody] = useState(prompt.body);
  const [model, setModel] = useState(prompt.model);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const isDirty = body !== prompt.body || model !== prompt.model;

  function onSave() {
    if (!body.trim()) {
      toast.error("El body no puede estar vacío.");
      return;
    }
    startTransition(async () => {
      const res = await updatePromptAction({
        promptId: prompt.id,
        body,
        model,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Prompt guardado");
      setSavedAt(new Date().toLocaleTimeString("es-MX"));
      router.refresh();
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Eliminar el prompt "${prompt.label}" permanentemente. ¿Continuar?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deletePromptAction({
        promptId: prompt.id,
        key: prompt.key,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Prompt eliminado");
      router.push("/settings/prompts");
    });
  }

  function onReset() {
    if (
      !confirm(
        "Esto reemplaza el contenido actual con el default que viene en el repo. Vas a perder tus ediciones. ¿Continuar?",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await resetPromptToDefaultAction({
        promptId: prompt.id,
        key: prompt.key,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Prompt restaurado al default");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Modelo
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={pending}
            className="mt-1 h-9 w-full max-w-xs rounded-md border border-border bg-background px-2.5 text-sm"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            {!AVAILABLE_MODELS.some((m) => m.value === model) ? (
              <option value={model}>{model} (custom)</option>
            ) : null}
          </select>
        </div>
        <div className="text-xs text-muted-foreground">
          {savedAt ? `Guardado a las ${savedAt}` : null}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Body del prompt
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={pending}
          rows={32}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
          spellCheck={false}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {prompt.key === "kickoff_master" ? (
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={pending}
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar default
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              disabled={pending}
              className="gap-2 text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </Button>
          )}
        </div>
        <Button
          type="button"
          onClick={onSave}
          disabled={!isDirty || pending}
          className="gap-2"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
