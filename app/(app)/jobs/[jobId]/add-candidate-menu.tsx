"use client";

import Link from "next/link";
import { Plus, UserSearch } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/**
 * Add-candidates trigger. Every entry point (this per-vacante header,
 * the candidates table, the global "+" menu, the jobs-table row menu)
 * opens the SAME flow by navigating to `?addCandidates=1` — the method
 * picker + dialogs live in the app-wide <AddCandidatesHost/>. When
 * `jobId` is set we pass `&job=<id>` so the chosen method attaches the
 * candidate to that vacante's first stage; without it the candidate
 * lands in the talent pool.
 */
export function AddCandidateMenu({ jobId }: { jobId?: string }) {
  const t = useT();
  const href = jobId
    ? `?addCandidates=1&job=${jobId}`
    : "?addCandidates=1";
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={t("candidateImport.addCandidates")}
      title={t("candidateImport.addCandidates")}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-fg-on-accent transition-colors hover:bg-accent/90"
    >
      <UserSearch className="h-4 w-4" />
      <Plus
        className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent stroke-[3] ring-2 ring-bg-1"
        aria-hidden
      />
    </Link>
  );
}
