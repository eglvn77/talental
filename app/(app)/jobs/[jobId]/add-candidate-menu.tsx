"use client";

import { useState } from "react";
import Link from "next/link";
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
import { LinkedinImportDialog } from "./linkedin-import-modal";

/**
 * Single entry point for adding candidates from the job header. The
 * dropdown surfaces the flows we support today plus placeholders for
 * the ones we plan to add next. Each option mounts its own dialog
 * directly — no nested boxes, no second click.
 */
export function AddCandidateMenu({ jobId }: { jobId: string }) {
  const [mode, setMode] = useState<"manual" | "bulk" | "linkedin" | null>(null);

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
            onClick={() => setMode("linkedin")}
            className="gap-2"
          >
            <Linkedin className="h-3.5 w-3.5" />
            Links de LinkedIn
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2">
            <Link href="/candidates/import">
              <Sheet className="h-3.5 w-3.5" />
              Subir CSV
            </Link>
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
      <LinkedinImportDialog
        jobId={jobId}
        open={mode === "linkedin"}
        onClose={() => setMode(null)}
      />
    </>
  );
}
