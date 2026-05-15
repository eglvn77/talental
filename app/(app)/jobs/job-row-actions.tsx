"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
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

export function JobRowActions({
  jobId,
  title,
  applicationCount,
}: {
  jobId: string;
  title: string;
  applicationCount: number;
}) {
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
      toast.success("Vacante eliminada");
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
            aria-label="Acciones"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            className="text-red-600 focus:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar vacante
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <span />
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>¿Eliminar vacante?</DialogTitle>
          <DialogDescription>
            Vas a eliminar <strong className="font-medium text-foreground">{title}</strong>{" "}
            permanentemente. Esto también borra sus etapas, candidaturas y
            bitácora ({applicationCount}{" "}
            {applicationCount === 1 ? "candidato" : "candidatos"}). Los
            candidatos seguirán en tu base de talento.
          </DialogDescription>
          {error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="inline-flex h-9 items-center rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? "Eliminando…" : "Eliminar vacante"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
