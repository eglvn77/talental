import { type JobStatus } from "@/lib/hiring";

/**
 * Spanish labels + palette for `hiring.jobs.status`. Single source of truth
 * shared by the status badge (display) and the status select (dropdown).
 */
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: "Borrador",
  awaiting_payment: "Pendiente de pago",
  paid: "Pagada",
  published: "Publicada",
  paused: "En pausa",
  closed: "Cerrada",
};

export const JOB_STATUS_STYLE: Record<JobStatus, { bg: string; fg: string }> = {
  draft: { bg: "#e2e8f0", fg: "#475569" }, // slate
  awaiting_payment: { bg: "#fef3c7", fg: "#92400e" }, // amber
  paid: { bg: "#dbeafe", fg: "#1e3a8a" }, // blue
  published: { bg: "#d1fae5", fg: "#065f46" }, // green
  paused: { bg: "#fed7aa", fg: "#9a3412" }, // orange
  closed: { bg: "#f1f5f9", fg: "#64748b" }, // muted slate
};

/**
 * Allowed forward transitions. Mirrors `ROLE_STATUS_NEXT` from the original
 * status-select; centralized here so the badge + select can both consult it.
 */
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ["awaiting_payment", "closed"],
  awaiting_payment: ["paid", "closed"],
  paid: ["published", "closed"],
  published: ["paused", "closed"],
  paused: ["published", "closed"],
  closed: [],
};
