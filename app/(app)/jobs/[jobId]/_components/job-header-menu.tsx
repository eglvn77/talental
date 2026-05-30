"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  CheckCircle2,
  Download,
  Loader2,
  MoreVertical,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  deleteJobAction,
  updateJobStatusAction,
} from "@/app/(app)/actions";
import { type JobStatusRow } from "@/lib/hiring";

/**
 * Kebab menu in the vacante header — groups the project-level
 * actions (export, archive, delete) so the primary chrome stays
 * focused on candidates and Kickoff.
 *
 *   Exportar CSV → /api/jobs/[id]/export-csv (download)
 *   Archivar     → opens an outcome picker (Cubierta / Cancelada)
 *   Eliminar     → deleteJobAction (with confirm)
 *
 * The two archived statuses (Cubierta = is_filled, Cancelada = the
 * other is_archived) are surfaced inside the outcome picker rather
 * than at the kebab level — keeps the menu short and forces the
 * recruiter to think about success vs failure as one decision.
 */
export function JobHeaderMenu({
  jobId,
  title,
  isAlreadyArchived,
  jobStatuses,
}: {
  jobId: string;
  title: string;
  /** True when status is already in an archived row — hides the
   *  Archivar item. */
  isAlreadyArchived: boolean;
  jobStatuses: JobStatusRow[];
}) {
  const t = useT();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const filledStatus = jobStatuses.find(
    (s) => s.is_archived && s.is_filled,
  );
  const cancelledStatus = jobStatuses.find(
    (s) => s.is_archived && !s.is_filled,
  );

  function onPickOutcome(row: JobStatusRow) {
    startTransition(async () => {
      const res = await updateJobStatusAction(jobId, row.id);
      setOutcomeOpen(false);
      if (!res.ok) {
        toast.actionFailed(t("jobSubtabs.archiveFailed"), res.error);
        return;
      }
      toast.actionOk(t("jobSubtabs.jobMarkedAs", { label: row.label }));
      router.refresh();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const res = await deleteJobAction(jobId);
      setConfirmDelete(false);
      if (!res.ok) {
        toast.actionFailed(t("jobSubtabs.deleteFailed"), res.error);
        return;
      }
      toast.actionOk(t("jobSubtabs.jobDeleted"));
      router.push("/jobs");
    });
  }

  const hasArchiveOption = Boolean(filledStatus || cancelledStatus);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("jobSubtabs.moreActions")}
            title={t("jobSubtabs.moreActions")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-1 text-fg-muted transition-colors hover:bg-bg-2 hover:text-fg-1"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild className="gap-2">
            <a
              href={`/api/jobs/${jobId}/export-csv`}
              download
              aria-label={t("jobSubtabs.exportCandidatesCsv")}
            >
              <Download className="h-3.5 w-3.5" />
              {t("jobSubtabs.exportCsv")}
            </a>
          </DropdownMenuItem>
          {!isAlreadyArchived && hasArchiveOption ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setOutcomeOpen(true);
              }}
              className="gap-2"
            >
              <Archive className="h-3.5 w-3.5" />
              {t("jobSubtabs.archiveJob")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirmDelete(true);
            }}
            className="gap-2 text-danger focus:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("jobSubtabs.deleteJob")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OutcomePicker
        open={outcomeOpen}
        onOpenChange={setOutcomeOpen}
        title={title}
        filled={filledStatus ?? null}
        cancelled={cancelledStatus ?? null}
        onPick={onPickOutcome}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
        title={t("jobSubtabs.deleteJobConfirmTitle", { title })}
        description={t("jobSubtabs.deleteJobConfirmDesc")}
        confirmLabel={t("jobSubtabs.delete")}
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}

/**
 * Second-step picker: opens after the recruiter clicks "Archivar"
 * to ask whether the close was a success (Cubierta) or not
 * (Cancelada). Two big card-like buttons so the choice feels
 * intentional — this is the moment fill-rate metrics get their
 * signal, so we don't want it picked by accident.
 */
function OutcomePicker({
  open,
  onOpenChange,
  title,
  filled,
  cancelled,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  filled: JobStatusRow | null;
  cancelled: JobStatusRow | null;
  onPick: (row: JobStatusRow) => void;
}) {
  const t = useT();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "overflow-hidden rounded-lg border border-border bg-background shadow-modal",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold">
                {t("jobSubtabs.archiveJob")}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                {t("jobSubtabs.archiveJobSubtitle", { title })}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t("jobSubtabs.close")}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="space-y-2 px-5 py-4">
            {filled ? (
              <OutcomeCard
                icon={<CheckCircle2 className="h-5 w-5 text-positive" />}
                label={filled.label}
                hint={t("jobSubtabs.outcomeSuccessHint")}
                description={t("jobSubtabs.outcomeSuccessDesc")}
                onClick={() => onPick(filled)}
              />
            ) : null}
            {cancelled ? (
              <OutcomeCard
                icon={<XCircle className="h-5 w-5 text-muted-foreground" />}
                label={cancelled.label}
                hint={t("jobSubtabs.outcomeFailureHint")}
                description={t("jobSubtabs.outcomeFailureDesc")}
                onClick={() => onPick(cancelled)}
              />
            ) : null}
          </div>

          <div className="flex items-center justify-end border-t border-border bg-bg-1 px-5 py-3">
            <Dialog.Close className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              {t("jobSubtabs.cancel")}
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function OutcomeCard({
  icon,
  label,
  hint,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-md border border-border bg-bg-1 px-3 py-3 text-left transition-colors hover:border-accent/60 hover:bg-accent/5"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
            {hint}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}
