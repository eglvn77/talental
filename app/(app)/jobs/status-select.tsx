"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { type JobStatus } from "@/lib/hiring";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  jobStatusTransitions,
} from "@/lib/job-status";
import { Pill } from "@/components/ui/pill";
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
  const options = jobStatusTransitions(current);

  function onPick(next: JobStatus) {
    if (next === current) return;
    startTransition(async () => {
      const res = await updateJobStatusAction(jobId, next);
      if (!res.ok) {
        toast.actionFailed("No se pudo cambiar el estado", res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-full transition-colors hover:opacity-100 disabled:opacity-50"
            aria-label="Cambiar estado de la vacante"
          >
            <Pill tone={JOB_STATUS_TONE[current]} dot>
              {JOB_STATUS_LABEL[current]}
              {isPending ? (
                <Loader2 className="ml-0.5 h-3 w-3 animate-spin" />
              ) : (
                <ChevronDown className="ml-0.5 h-3 w-3" />
              )}
            </Pill>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map((next) => (
            <DropdownMenuItem
              key={next}
              onClick={() => onPick(next)}
              className="gap-2"
            >
              <Pill tone={JOB_STATUS_TONE[next]} dot>
                {JOB_STATUS_LABEL[next]}
              </Pill>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
