"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import type { PromptRow } from "@/lib/hiring";
import { useT } from "@/lib/i18n/client";
import { AVAILABLE_MODELS } from "@/lib/models";
import { toast } from "@/lib/toast";
import { useDialogShortcuts } from "@/lib/use-dialog-shortcuts";
import {
  calibratePromptAction,
  deletePromptAction,
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
          {prompt.key === "kickoff_master" ? null : (
            // kickoff_master is required by the product — server blocks
            // delete (see actions.ts deletePromptAction). The previous
            // "Restore default" button was removed at the user's
            // request: the prompt stays freely editable, no reset path.
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
        <div className="flex items-center gap-2">
          <CalibrateWithPrompt
            promptId={prompt.id}
            currentBody={body}
            onResult={(next) => setBody(next)}
            disabled={pending}
          />
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

    </div>
  );
}

/**
 * "Calibrate" the prompt itself with a natural-language instruction.
 * Mirrors the per-section Calibrate UX used in Paquete (.btn-ai
 * gradient + Sparkles icon + small textarea dialog) so the AI-driven
 * action reads as the same kind of moment across the app.
 *
 * On success, the rewritten body is swapped into the editor's local
 * state — the recruiter still has to click Save to persist, so they
 * can review the diff before committing.
 */
function CalibrateWithPrompt({
  promptId,
  currentBody,
  onResult,
  disabled,
}: {
  promptId: string;
  currentBody: string;
  onResult: (next: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [pending, startTransition] = useTransition();

  useDialogShortcuts({
    enabled: open,
    onSubmit: () => submit(),
    onCancel: () => {
      if (!pending) setOpen(false);
    },
  });

  function submit() {
    if (!instruction.trim()) return;
    startTransition(async () => {
      const res = await calibratePromptAction({
        promptId,
        currentBody,
        userPrompt: instruction.trim(),
      });
      if (!res.ok) {
        toast.actionFailed("Edit", res.error);
        return;
      }
      onResult(res.data.body);
      setOpen(false);
      setInstruction("");
      toast.actionOk("Prompt updated — review and Save");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="Edit this prompt with AI"
        title="Edit this prompt with AI"
        className="btn-ai inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Edit with AI
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl">
            <h2 className="mb-1 text-sm font-semibold">Edit prompt with AI</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Describe what should change. The AI rewrites only what you
              ask and keeps the rest intact. Review the result before
              hitting Save.
            </p>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              autoFocus
              rows={5}
              disabled={pending}
              placeholder={`e.g. "Add a section about how to handle salary mismatches" or "Make the tone less formal"`}
              className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !instruction.trim()}
                className="btn-ai inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Editing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Edit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
