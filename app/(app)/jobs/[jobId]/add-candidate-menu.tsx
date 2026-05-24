"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Linkedin, Sheet, UserPlus } from "lucide-react";
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
 * Single entry point for adding candidates — same component, two
 * modes. When `jobId` is provided (per-vacante header) every option
 * creates the candidate AND attaches an application in that job's
 * first stage. When omitted (talent-pool page header) candidates
 * land in the pool without applications — same dialogs, same UX,
 * just no application side-effect.
 *
 * Options:
 *   Manualmente       — single-record form
 *   Importar CVs      — bulk PDF / DOCX parsing wizard
 *   Links de LinkedIn — paste URLs, async enrichment
 *   Importar CSV      — full-page mapping wizard at /candidates/import
 */
export function AddCandidateMenu({ jobId }: { jobId?: string }) {
  const [mode, setMode] = useState<"manual" | "bulk" | "linkedin" | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Icon-only trigger with tooltip — matches the rest of the
              vacante chrome (Calibrar, Filtros, Vista, kebab). The
              dropdown still surfaces all the import flows on click. */}
          <button
            type="button"
            aria-label="Agregar candidatos"
            title="Agregar candidatos"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-fg-on-accent transition-colors hover:bg-accent/90"
          >
            <UserPlus className="h-4 w-4" />
          </button>
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
            <Link href="/candidates/import?tab=csv">
              <Sheet className="h-3.5 w-3.5" />
              Importar CSV
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
