"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { loadClosureReasonsAction } from "../../../actions";

/**
 * Modal that intercepts a transition into any is_archived job status
 * and asks the admin to pick a closure reason (radio list) + optional
 * free-text notes.
 *
 * Reasons load on first open via the server action — cheap query, no
 * point prefetching every render of the page. The list is fixed once
 * loaded (no debounced search) since there are only ~10 of them.
 *
 * The caller wires `onConfirm` to the real status change; we just
 * collect input and surface a Loader2 while submitting.
 *
 * Mirrors RejectionReasonDialog for visual + behavior parity.
 */
export function JobClosureDialog({
  open,
  jobTitle,
  targetStatusLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Title shown so the admin is sure they're closing the right job. */
  jobTitle: string;
  /** The archived status the user is transitioning into (for context). */
  targetStatusLabel: string;
  onCancel: () => void;
  onConfirm: (input: {
    reasonId: string;
    notes: string;
  }) => Promise<void>;
}) {
  const t = useT();
  const [reasons, setReasons] = useState<
    Array<{ id: string; name: string }> | null
  >(null);
  const [reasonId, setReasonId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReasonId("");
    setNotes("");
    setError(null);
    setSubmitting(false);

    let cancelled = false;
    if (reasons === null) {
      void (async () => {
        const res = await loadClosureReasonsAction();
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setReasons(res.data);
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit() {
    if (!reasonId) {
      setError(t("closureDialog.selectReasonError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ reasonId, notes });
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : t("closureDialog.somethingFailed"));
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (!o ? onCancel() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "flex max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-modal",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold">
                {t("closureDialog.title", { status: targetStatusLabel })}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                {t("closureDialog.subtitle", { jobTitle })}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t("closureDialog.close")}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onCancel}
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {reasons === null ? (
              <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {t("closureDialog.loading")}
              </div>
            ) : (
              <fieldset className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <legend className="sr-only">{t("closureDialog.reasons")}</legend>
                {reasons.map((r) => (
                  <label
                    key={r.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                      reasonId === r.id
                        ? "border-accent bg-accent/5 text-foreground"
                        : "border-border bg-bg-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name="closure-reason"
                      value={r.id}
                      checked={reasonId === r.id}
                      onChange={() => setReasonId(r.id)}
                      className="h-3 w-3 accent-accent"
                    />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
              </fieldset>
            )}

            <div className="mt-4 space-y-1.5">
              <label
                htmlFor="closure-notes"
                className="block text-[11px] font-medium text-foreground"
              >
                {t("closureDialog.notesOptional")}
              </label>
              <textarea
                id="closure-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("closureDialog.notesPlaceholder")}
                rows={3}
                className="w-full rounded-md border border-border bg-bg-1 px-2 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            {error ? (
              <p className="mt-3 text-[11px] text-danger">{error}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-1 px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={submitting}
            >
              {t("closureDialog.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={submitting || !reasonId}
              className="gap-1"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {t("closureDialog.confirm")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
