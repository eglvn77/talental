import { type JobStatus } from "@/lib/hiring";

/**
 * Spanish labels + palette for `hiring.jobs.status`. Single source of truth
 * shared by the status badge (display) and the status select (dropdown).
 */
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  borrador: "Borrador",
  activa: "Activa",
  por_cerrar: "Por Cerrar",
  cubierta: "Cubierta",
  cancelada: "Cancelada",
};

export const JOB_STATUS_STYLE: Record<JobStatus, { bg: string; fg: string }> = {
  borrador: { bg: "#e2e8f0", fg: "#475569" }, // slate — no published yet
  activa: { bg: "#d1fae5", fg: "#065f46" }, // green — live & recruiting
  por_cerrar: { bg: "#fef3c7", fg: "#92400e" }, // amber — winding down
  cubierta: { bg: "#dbeafe", fg: "#1e3a8a" }, // blue — successful close
  cancelada: { bg: "#fee2e2", fg: "#991b1b" }, // red — abandoned
};

/** Stable ordering used by selects/filters. */
export const JOB_STATUS_VALUES: JobStatus[] = [
  "borrador",
  "activa",
  "por_cerrar",
  "cubierta",
  "cancelada",
];

/**
 * Allowed transitions from `current`: any status except `current` itself.
 * The user can revert "Cubierta" or "Cancelada" if they marked it by
 * mistake — no terminal states in the UI.
 */
export function jobStatusTransitions(current: JobStatus): JobStatus[] {
  return JOB_STATUS_VALUES.filter((s) => s !== current);
}
