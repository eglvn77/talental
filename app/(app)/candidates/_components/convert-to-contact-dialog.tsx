"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { CompanyCombobox } from "../../jobs/new/company-combobox";
import { convertCandidateToContactAction } from "../../actions";

/**
 * Modal that turns an active candidate into a contact. Company is
 * required (contacts live under a company in the CRM); job title is
 * optional. Closes the parent slideover on success and routes the
 * user to the new contact's company page.
 */
export function ConvertToContactDialog({
  open,
  candidateId,
  candidateName,
  onClose,
  onSuccess,
}: {
  open: boolean;
  candidateId: string;
  candidateName: string;
  onClose: () => void;
  /** Called after successful conversion (e.g. to close the candidate
   *  slideover and navigate away). */
  onSuccess?: (contactId: string) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  async function handleSubmit() {
    if (!companyId) {
      setError(t("candidatesArea.convertNeedsCompany"));
      return;
    }
    setSubmitting(true);
    setError(null);
    start(async () => {
      const res = await convertCandidateToContactAction({
        candidateId,
        companyId,
        title: title.trim() || null,
      });
      setSubmitting(false);
      if (!res.ok) {
        const msg =
          res.error === "conflict"
            ? t("candidatesArea.convertConflict")
            : res.error;
        setError(msg);
        return;
      }
      toast.actionOk(t("candidatesArea.convertedToContact"));
      if (onSuccess) onSuccess(res.data.contactId);
      else router.push(`/contacts?contact=${res.data.contactId}`);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
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
                {t("candidatesArea.convertDialogTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                {t("candidatesArea.convertDialogSubtitle", {
                  name: candidateName,
                })}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t("common.close")}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("candidatesArea.convertCompanyLabel")} *
                </label>
                <CompanyCombobox
                  onChange={(c) => setCompanyId(c?.id ?? "")}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("candidatesArea.convertTitleLabel")}
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("candidatesArea.convertTitlePlaceholder")}
                />
              </div>
              {error ? (
                <p className="text-[11px] text-danger">{error}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-1 px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={submitting || !companyId}
              className="gap-1"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {t("candidatesArea.convertConfirmLabel")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
