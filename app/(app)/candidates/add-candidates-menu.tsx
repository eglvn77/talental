"use client";

import Link from "next/link";
import { ChevronDown, FileText, Plus, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Talent-pool entry point for adding candidates (no job context). Mirrors
 * the per-job AddCandidateMenu but routes to /candidates/import — the
 * imports land in the talent pool, not against a specific application.
 *
 * Menu options:
 *  - Importar CVs (PDFs) — Gemini parses, preview + bulk save
 *  - Importar CSV — column-mapping wizard
 */
export function AddCandidatesMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="h-4 w-4" />
          Agregar candidatos
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/candidates/import?tab=cv">
            <FileText className="h-3.5 w-3.5" />
            Importar CVs (PDFs)
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/candidates/import?tab=csv">
            <Sheet className="h-3.5 w-3.5" />
            Importar CSV
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
