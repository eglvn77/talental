"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { type JobStatus } from "@/lib/hiring";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_STYLE,
  JOB_STATUS_TRANSITIONS,
} from "@/lib/job-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateJobStatusAction } from "../actions";

/**
 * The status badge IS the dropdown trigger. Clicking it surfaces the valid
 * forward transitions; selecting one fires updateJobStatusAction and the
 * page refreshes. If the status has no valid transitions (e.g. `closed`)
 * the badge renders as a plain, non-interactive chip.
 */
export function JobStatusSelect({
  jobId,
  current,
}: {
  jobId: string;
  current: JobStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = JOB_STATUS_TRANSITIONS[current] ?? [];
  const s = JOB_STATUS_STYLE[current];

  function onPick(next: JobStatus) {
    if (next === current) return;
    setError(null);
    startTransition(async () => {
      const res = await updateJobStatusAction(jobId, next);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  // Terminal states render as a plain chip (no dropdown).
  if (options.length === 0) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ background: s.bg, color: s.fg }}
      >
        {JOB_STATUS_LABEL[current]}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: s.bg, color: s.fg }}
            aria-label="Cambiar estado de la vacante"
          >
            {JOB_STATUS_LABEL[current]}
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map((next) => {
            const ns = JOB_STATUS_STYLE[next];
            return (
              <DropdownMenuItem
                key={next}
                onClick={() => onPick(next)}
                className="gap-2"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: ns.fg }}
                />
                {JOB_STATUS_LABEL[next]}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
