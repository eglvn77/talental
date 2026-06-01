"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2, UserPlus } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { deleteJobAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export function JobRowActions({
  jobId,
  title,
  applicationCount,
}: {
  jobId: string;
  title: string;
  applicationCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteJobAction(jobId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.actionOk(t("jobsList.toastDeleted"));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("jobsList.actions")}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link
              href={`/jobs?addCandidates=1&job=${jobId}`}
              scroll={false}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t("candidateImport.addCandidates")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={`/jobs/${jobId}/settings`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("jobsList.editJob")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            className="text-danger focus:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("jobsList.deleteJob")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <span />
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>{t("jobsList.deleteConfirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("jobsList.deleteConfirmBefore")}{" "}
            <strong className="font-medium text-foreground">{title}</strong>{" "}
            {t("jobsList.deleteConfirmAfter", {
              count:
                applicationCount === 1
                  ? t("jobsList.candidateCountOne", { count: applicationCount })
                  : t("jobsList.candidateCountOther", {
                      count: applicationCount,
                    }),
            })}
          </DialogDescription>
          {error ? (
            <p className="text-xs text-danger">{error}</p>
          ) : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {t("jobsList.cancel")}
            </Button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="inline-flex h-9 items-center rounded-md bg-danger px-4 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? t("jobsList.deleting") : t("jobsList.deleteJob")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
