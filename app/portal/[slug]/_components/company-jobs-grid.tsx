"use client";

import Link from "next/link";
import { Briefcase } from "lucide-react";
import type { JobRow } from "@/lib/hiring";
import { useT } from "@/lib/i18n/client";

export function CompanyJobsGrid({
  slug,
  jobs,
  counts,
}: {
  slug: string;
  jobs: JobRow[];
  counts: Record<string, number>;
}) {
  const t = useT();
  if (jobs.length === 0) {
    return (
      <p className="mt-6 rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-8 text-center text-sm text-muted-foreground">
        {t("portal.noCandidates")}
      </p>
    );
  }
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {jobs.map((job) => (
        <li key={job.id}>
          <Link
            href={`/portal/${slug}/j/${job.id}`}
            className="block rounded-md border border-border bg-bg-2 p-4 transition-colors hover:border-foreground/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {job.title ?? "—"}
                </p>
                {job.work_modality ? (
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {job.work_modality}
                  </p>
                ) : null}
              </div>
              <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("portal.candidatesCount", { n: counts[job.id] ?? 0 })}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
