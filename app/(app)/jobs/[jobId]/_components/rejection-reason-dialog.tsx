"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { loadRejectionReasonsAction } from "../../../actions";

/**
 * Modal that intercepts a drop-into-rejected and asks the recruiter
 * to pick a reason (radio list) + an optional free-text note.
 *
 * Reasons load on first open via the server action — cheap query, no
 * point prefetching every render of the kanban. The list is fixed
 * once loaded (no debounced search) since there are only ~20 of them.
 *
 * The caller wires `onConfirm` to the real move; we just collect
 * input and surface a Loader2 while submitting.
 */
export function RejectionReasonDialog({
  open,
  candidateName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Name shown in the dialog header so the recruiter is sure they
   *  picked the right card. */
  candidateName: string;
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
    // Reset on each open so a previous attempt doesn't bleed in.
    setReasonId("");
    setNotes("");
    setError(null);
    setSubmitting(false);

    let cancelled = false;
    if (reasons === null) {
      void (async () => {
        const res = await loadRejectionReasonsAction();
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
    // We intentionally don't re-fetch on every open — reasons rarely
    // change. The state lives until the page reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit() {
    if (!reasonId) {
      setError(t("jobSubtabs.selectReasonError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ reasonId, notes });
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : t("jobSubtabs.somethingFailed"));
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
                {t("jobSubtabs.rejectCandidateTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                {t("jobSubtabs.rejectCandidateSubtitle", { candidateName })}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t("jobSubtabs.close")}
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
                {t("jobSubtabs.loadingReasons")}
              </div>
            ) : (
              <fieldset className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <legend className="sr-only">{t("jobSubtabs.reasons")}</legend>
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
                      name="rejection-reason"
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
                htmlFor="rejection-notes"
                className="block text-[11px] font-medium text-foreground"
              >
                {t("jobSubtabs.notesOptional")}
              </label>
              <textarea
                id="rejection-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("jobSubtabs.rejectionNotesPlaceholder")}
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
              {t("jobSubtabs.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={submitting || !reasonId}
              className="gap-1"
            >
              {submitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              {t("jobSubtabs.confirmRejection")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
