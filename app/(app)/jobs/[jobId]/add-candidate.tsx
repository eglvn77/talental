"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import { type CandidateSource } from "@/lib/hiring";
import { addCandidateAction } from "../../actions";
import { AddCandidateDestinationPanel } from "../../_components/add-candidate-destination-panel";

/**
 * Manual add-candidate dialog. Controlled — the parent decides when
 * it opens. When `jobId` is provided the candidate also gets an
 * application in that job's first stage; without `jobId` the
 * candidate lands in the talent pool only.
 */
export function ManualAddCandidateDialog({
  jobId,
  source = "other",
  onSourceChange,
  stages,
  stageId,
  onStageChange,
  open,
  onClose,
}: {
  jobId?: string;
  /** Source — selected inside this dialog via DestinationPanel. */
  source?: CandidateSource;
  onSourceChange?: (next: CandidateSource) => void;
  /** Stages of the target vacante (optional — pool-only flows skip). */
  stages?: Array<{ id: string; name: string }>;
  stageId?: string | null;
  onStageChange?: (next: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await addCandidateAction({
        jobId,
        fullName: String(fd.get("full_name") ?? ""),
        email: (fd.get("email") as string) || undefined,
        linkedinUrl: (fd.get("linkedin_url") as string) || undefined,
        source,
        stageId,
      });
      if (!res.ok) setError(res.error);
      else {
        (e.target as HTMLFormElement).reset();
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-[min(95vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background shadow-modal">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-base font-semibold">
              {t("candidateImport.newCandidate")}
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label={t("candidateImport.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={onSubmit} className="space-y-4 p-5">
            {/* Source + target stage, asked here instead of inside the
                method picker. The picker now stays focused on "how to
                add"; the dialog handles "from where + to which stage". */}
            <AddCandidateDestinationPanel
              source={source}
              onSourceChange={(s) => onSourceChange?.(s)}
              stages={stages}
              stageId={stageId ?? ""}
              onStageChange={(s) => onStageChange?.(s)}
            />
            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("candidateImport.fullNameLabel")}
                </span>
                <Input name="full_name" required className="mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("candidateImport.emailLabel")}
                </span>
                <Input name="email" type="email" className="mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("candidateImport.linkedinUrlLabel")}
                </span>
                <Input name="linkedin_url" className="mt-1" />
              </label>
            </div>
            {error ? (
              <p className="mt-3 text-xs text-danger">{error}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isPending}
              >
                {t("candidateImport.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? t("candidateImport.adding")
                  : t("candidateImport.add")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
