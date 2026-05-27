"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { type JobStatusRow } from "@/lib/hiring";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateJobStatusAction } from "../actions";

/**
 * The status pill IS the dropdown trigger. Clicking it surfaces all
 * other workspace statuses (excluding the current one) and selecting
 * one fires updateJobStatusAction with the new status_id.
 *
 * Now workspace-scoped: parent server component passes the full list
 * of statuses (rows from hiring.job_statuses) plus the current id.
 * Label + color are read off each row, so admin renames in
 * /settings/job-statuses surface here on the next render.
 */
export function JobStatusSelect({
  jobId,
  currentStatusId,
  statuses,
}: {
  jobId: string;
  currentStatusId: string;
  statuses: JobStatusRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const current =
    statuses.find((s) => s.id === currentStatusId) ?? statuses[0] ?? null;
  const options = statuses.filter((s) => s.id !== currentStatusId);

  function onPick(next: JobStatusRow) {
    if (next.id === currentStatusId) return;
    startTransition(async () => {
      const res = await updateJobStatusAction(jobId, next.id);
      if (!res.ok) {
        toast.actionFailed("No se pudo cambiar el estado", res.error);
        return;
      }
      router.refresh();
    });
  }

  if (!current) return null;

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
            <StatusPill row={current}>
              {isPending ? (
                <Loader2 className="ml-0.5 h-3 w-3 animate-spin" />
              ) : (
                <ChevronDown className="ml-0.5 h-3 w-3" />
              )}
            </StatusPill>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map((next) => (
            <DropdownMenuItem
              key={next.id}
              onClick={() => onPick(next)}
              className="gap-2"
            >
              <StatusPill row={next} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Status pill using the row's `color` hex directly. We bypass the
 * Distillate Pill primitive (limited to 4 preset tones) because
 * workspace-defined statuses can be any hex. The 22-suffix on
 * background is hex alpha (~13%) so the chip reads as a tinted
 * background of the same hue without overpowering the text.
 */
function StatusPill({
  row,
  children,
}: {
  row: JobStatusRow;
  children?: React.ReactNode;
}) {
  const color = row.color || "#94a3b8";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: color + "22", color }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {row.label}
      {children}
    </span>
  );
}
