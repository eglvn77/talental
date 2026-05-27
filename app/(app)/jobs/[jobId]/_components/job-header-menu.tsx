"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  Loader2,
  MoreVertical,
  Trash2,
  XCircle,
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
import { type JobStatusRow } from "@/lib/hiring";

/**
 * Kebab menu in the vacante header — groups the project-level
 * actions (export, close, delete) so the primary chrome stays
 * focused on candidates and Kickoff.
 *
 *   Exportar CSV                → /api/jobs/[id]/export-csv (download)
 *   Cerrar con éxito (Cubierta) → status to the is_filled row + confirm
 *   Cerrar sin éxito (Cancelada)→ status to the other is_archived row
 *   Eliminar                    → deleteJobAction (with confirm)
 *
 * The close items show the actual workspace label for each archived
 * status (admin may have renamed Cubierta → "Closed Won" etc.), with
 * the lifecycle hint in parens so the recruiter knows which is
 * which regardless of how they named it.
 */
export function JobHeaderMenu({
  jobId,
  title,
  isAlreadyArchived,
  jobStatuses,
}: {
  jobId: string;
  title: string;
  /** True when status is already in an archived row — hides both
   *  close items (already done). */
  isAlreadyArchived: boolean;
  /** Workspace statuses. The menu picks the is_filled row for
   *  "Cerrar con éxito" and the other is_archived row for "Cerrar
   *  sin éxito". Passed in from the server layout. */
  jobStatuses: JobStatusRow[];
}) {
  const router = useRouter();
  // `confirm` carries the target row when we're about to commit a
  // close, or "delete" when the destructive delete confirm is up.
  // Differentiated by a discriminated union so the dialog can pick
  // the right copy.
  type Confirm =
    | { kind: "close"; row: JobStatusRow }
    | { kind: "delete" }
    | null;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [isPending, startTransition] = useTransition();
  const filledStatus = jobStatuses.find(
    (s) => s.is_archived && s.is_filled,
  );
  const cancelledStatus = jobStatuses.find(
    (s) => s.is_archived && !s.is_filled,
  );

  function onClose(row: JobStatusRow) {
    startTransition(async () => {
      const res = await updateJobStatusAction(jobId, row.id);
      setConfirm(null);
      if (!res.ok) {
        toast.actionFailed("No se pudo cerrar", res.error);
        return;
      }
      toast.actionOk(`Vacante marcada como ${row.label}`);
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
        <DropdownMenuContent align="end" className="w-64">
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
          {!isAlreadyArchived && filledStatus ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirm({ kind: "close", row: filledStatus });
              }}
              className="gap-2"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
              <span className="flex-1 truncate">{filledStatus.label}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                con éxito
              </span>
            </DropdownMenuItem>
          ) : null}
          {!isAlreadyArchived && cancelledStatus ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirm({ kind: "close", row: cancelledStatus });
              }}
              className="gap-2"
            >
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate">{cancelledStatus.label}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                sin éxito
              </span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirm({ kind: "delete" });
            }}
            className="gap-2 text-danger focus:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar vacante
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm?.kind === "close"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === "close"
            ? `Marcar "${title}" como ${confirm.row.label}`
            : ""
        }
        description={
          confirm?.kind === "close"
            ? confirm.row.is_filled
              ? "La vacante se cierra como un placement exitoso. Cuenta en tus métricas de fill-rate. Puedes revertir desde el estado en cualquier momento."
              : "La vacante se cierra sin colocación. No cuenta como fill. Puedes revertir desde el estado en cualquier momento."
            : ""
        }
        confirmLabel="Confirmar"
        onConfirm={() => {
          if (confirm?.kind === "close") onClose(confirm.row);
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === "delete"}
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
