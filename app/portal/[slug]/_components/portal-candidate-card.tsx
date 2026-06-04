"use client";

import type { CandidateRow, JobClientPortalSettingsRow } from "@/lib/hiring";

export function PortalCandidateCard({
  candidate,
  stageColor,
}: {
  candidate: CandidateRow;
  /** Reserved — used in commit 4 for the salary block once we plumb
   *  custom-field values into the card. */
  settings?: JobClientPortalSettingsRow | null;
  stageColor?: string | null;
}) {
  return (
    <article
      className="rounded-md border border-border bg-background p-2.5 shadow-sm transition-shadow hover:shadow-md"
      style={
        stageColor
          ? { borderLeft: `3px solid ${stageColor}` }
          : undefined
      }
    >
      <div className="flex items-start gap-2">
        {candidate.profile_picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidate.profile_picture_url}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded-full bg-muted text-center text-[11px] font-medium leading-7 text-muted-foreground">
            {(candidate.full_name ?? "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">
            {candidate.full_name ?? "—"}
          </p>
          {candidate.current_position ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {candidate.current_position}
            </p>
          ) : null}
          {candidate.current_company_name ? (
            <p className="truncate text-[10px] text-muted-foreground">
              {candidate.current_company_name}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
