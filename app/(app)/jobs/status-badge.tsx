import { type JobStatus } from "@/lib/hiring";
import { JOB_STATUS_LABEL, JOB_STATUS_STYLE } from "@/lib/job-status";

/**
 * Pure-display badge with the Spanish label + per-status palette. For an
 * interactive version (click to change), use <JobStatusSelect>.
 */
export function StatusBadge({ status }: { status: JobStatus }) {
  const s = JOB_STATUS_STYLE[status];
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {JOB_STATUS_LABEL[status]}
    </span>
  );
}
