"use client";

import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CandidateRow } from "@/lib/hiring";
import type { CompanyChipData } from "@/app/(app)/_components/company-chip";
import {
  CandidateProfileBody,
  type CandidateProfileApp,
} from "./candidate-profile-body";

/**
 * Right-side slideover for a candidate's talent-pool profile.
 *
 * Mounted on /candidates whenever `?candidate=<id>` is in the URL.
 * Closing the dialog drops the query param. Reuses
 * <CandidateProfileBody> so the same content also renders standalone
 * at /candidates/[id] for deep-linking / sharing.
 */
export function CandidateProfileSlideover({
  candidate,
  companiesById,
  applications,
}: {
  candidate: CandidateRow;
  companiesById: Record<string, CompanyChipData>;
  applications: CandidateProfileApp[];
}) {
  const router = useRouter();
  function close() {
    // Drop the ?candidate= param. `router.push('?')` falls back to
    // the current pathname (i.e. /candidates) with no query.
    router.push("?", { scroll: false });
  }
  return (
    <Dialog.Root open onOpenChange={(o) => (!o ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-border bg-background shadow-modal",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="sr-only">
              Perfil de {candidate.full_name}
            </Dialog.Title>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Talent pool
            </span>
            <Dialog.Close
              aria-label="Cerrar"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="flex-1 px-6 py-6">
            <CandidateProfileBody
              candidate={candidate}
              companiesById={companiesById}
              applications={applications}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
