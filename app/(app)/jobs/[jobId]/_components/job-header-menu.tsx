"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Download,
  Loader2,
  MoreVertical,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import {
  deleteJobAction,
  updateJobStatusAction,
} from "@/app/(app)/actions";

/**
 * Kebab menu in the vacante header — groups the project-level
 * actions (export, archive, delete) so the primary chrome stays
 * focused on candidates and Kickoff. Three items today:
 *
 *   Exportar CSV   → /api/jobs/[id]/export-csv (download)
 *   Archivar       → status transition to "cubierta" (with confirm)
 *   Eliminar       → deleteJobAction (with confirm)
 *
 * Status transitions still surface on the editable JobStatusSelect
 * in the header, so "Archivar" is the one-click shortcut for the
 * common "we're done with this vacante" case.
 */
export function JobHeaderMenu({
  jobId,
  title,
  isAlreadyArchived,
}: {
  jobId: string;
  title: string;
  /** True when status is already cubierta — hides the Archivar item. */
  isAlreadyArchived: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"delete" | "archive" | null>(null);
  const [isPending, startTransition] = useTransition();

  function onArchive() {
    startTransition(async () => {
      const res = await updateJobStatusAction(jobId, "cubierta");
      setConfirm(null);
      if (!res.ok) {
        toast.actionFailed("No se pudo archivar", res.error);
        return;
      }
      toast.actionOk("Vacante archivada");
      router.refresh();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const res = await deleteJobAction(jobId);
      setConfirm(null);
      if (!res.ok) {
        toast.actionFailed("No se pudo eliminar", res.error);
        return;
      }
      toast.actionOk("Vacante eliminada");
      router.push("/jobs");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Más acciones"
            title="Más acciones"
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
              aria-label="Exportar candidatos a CSV"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </a>
          </DropdownMenuItem>
          {!isAlreadyArchived ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirm("archive");
              }}
              className="gap-2"
            >
              <Archive className="h-3.5 w-3.5" />
              Archivar
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirm("delete");
            }}
            className="gap-2 text-danger focus:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar vacante
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Archivar "${title}"`}
        description="Cambia el estado a Cubierta. Los candidatos y la bitácora se conservan. Puedes revertir el cambio desde el estado en cualquier momento."
        confirmLabel="Archivar"
        onConfirm={onArchive}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Eliminar "${title}"`}
        description="Se borra la vacante con sus etapas, candidaturas y bitácora. Los candidatos siguen en tu base de talento. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}
