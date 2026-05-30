"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import type { PromptRow } from "@/lib/hiring";
import { useT } from "@/lib/i18n/client";
import { AVAILABLE_MODELS } from "@/lib/models";
import { toast } from "@/lib/toast";
import {
  deletePromptAction,
  resetPromptToDefaultAction,
  updatePromptAction,
} from "../../actions";

export function PromptEditor({ prompt }: { prompt: PromptRow }) {
  const t = useT();
  const router = useRouter();
  const [body, setBody] = useState(prompt.body);
  const [model, setModel] = useState(prompt.model);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const isDirty = body !== prompt.body || model !== prompt.model;

  function onSave() {
    if (!body.trim()) {
      toast.actionFailed(t("promptsCfg.bodyEmpty"));
      return;
    }
    startTransition(async () => {
      const res = await updatePromptAction({
        promptId: prompt.id,
        body,
        model,
      });
      if (!res.ok) {
        toast.saveFailed(res.error);
        return;
      }
      toast.saved(t("promptsCfg.saved"));
      setSavedAt(new Date().toLocaleTimeString("es-MX"));
      router.refresh();
    });
  }

  async function onDeleteConfirmed() {
    const res = await deletePromptAction({
      promptId: prompt.id,
      key: prompt.key,
    });
    if (!res.ok) {
      toast.actionFailed(t("promptsCfg.deleteFailed"), res.error);
      return;
    }
    toast.actionOk(t("promptsCfg.deleteOk"));
    setConfirmDelete(false);
    router.push("/settings/prompts");
  }

  async function onResetConfirmed() {
    const res = await resetPromptToDefaultAction({
      promptId: prompt.id,
      key: prompt.key,
    });
    if (!res.ok) {
      toast.actionFailed(t("promptsCfg.resetFailed"), res.error);
      return;
    }
    toast.actionOk(t("promptsCfg.resetOk"));
    setConfirmReset(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {t("promptsCfg.fieldModel")}
          </label>
          <div className="mt-1 max-w-md">
            <Select
              value={model}
              onChange={setModel}
              disabled={pending}
              options={[
                ...AVAILABLE_MODELS.map((m) => ({
                  value: m.value,
                  label: m.label,
                })),
                // If the row references a model that's not in the
                // catalog (legacy / experiment), surface it as a
                // "(custom)" option so the picker doesn't bounce it.
                ...(!AVAILABLE_MODELS.some((m) => m.value === model)
                  ? [{ value: model, label: t("promptsCfg.modelCustom", { model }) }]
                  : []),
              ]}
            />
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {savedAt ? t("promptsCfg.savedAt", { time: savedAt }) : null}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">
          {t("promptsCfg.bodyFieldLabel")}
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
              onClick={() => setConfirmReset(true)}
              disabled={pending}
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("promptsCfg.resetDefaultButton")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              className="gap-2 text-danger hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("promptsCfg.deleteButton")}
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
          {pending ? t("promptsCfg.saving") : t("promptsCfg.save")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("promptsCfg.deleteConfirmTitle", { label: prompt.label })}
        description={t("promptsCfg.editorDeleteConfirmDescription")}
        confirmLabel={t("promptsCfg.deleteConfirmLabel")}
        destructive
        onConfirm={onDeleteConfirmed}
      />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("promptsCfg.resetConfirmTitle")}
        description={t("promptsCfg.resetConfirmDescription")}
        confirmLabel={t("promptsCfg.resetConfirmLabel")}
        onConfirm={onResetConfirmed}
      />
    </div>
  );
}
