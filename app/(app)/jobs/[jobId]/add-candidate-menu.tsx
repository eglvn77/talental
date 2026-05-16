"use client";

import { useState } from "react";
import { ChevronDown, FileText, Linkedin, Sheet, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ManualAddCandidateDialog } from "./add-candidate";
import { BulkUploadDialog } from "./bulk-upload-modal";

/**
 * Single entry point for adding candidates from the job header. The
 * dropdown surfaces the flows we support today plus placeholders for
 * the ones we plan to add next. Each option mounts its own dialog
 * directly — no nested boxes, no second click.
 */
export function AddCandidateMenu({ jobId }: { jobId: string }) {
  const [mode, setMode] = useState<"manual" | "bulk" | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Agregar Candidatos
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setMode("manual")} className="gap-2">
            <UserPlus className="h-3.5 w-3.5" />
            Manualmente
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("bulk")} className="gap-2">
            <FileText className="h-3.5 w-3.5" />
            Importar CVs
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            className="cursor-not-allowed gap-2 opacity-60"
            onClick={(e) => e.preventDefault()}
          >
            <Linkedin className="h-3.5 w-3.5" />
            <span className="flex-1">Links de LinkedIn</span>
            <span className="rounded bg-muted px-1 text-[9px] uppercase">
              Pronto
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            className="cursor-not-allowed gap-2 opacity-60"
            onClick={(e) => e.preventDefault()}
          >
            <Sheet className="h-3.5 w-3.5" />
            <span className="flex-1">Subir CSV</span>
            <span className="rounded bg-muted px-1 text-[9px] uppercase">
              Pronto
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManualAddCandidateDialog
        jobId={jobId}
        open={mode === "manual"}
        onClose={() => setMode(null)}
      />
      {mode === "bulk" ? (
        <BulkUploadDialog jobId={jobId} onClose={() => setMode(null)} />
      ) : null}
    </>
  );
}
