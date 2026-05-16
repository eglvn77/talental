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

/**
 * Allowed forward transitions. Terminal states (cubierta, cancelada) have
 * no outgoing edges — if the user picked wrong, they edit through the DB
 * (rare enough that we don't expose un-archive in the UI for v1).
 */
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  borrador: ["activa", "cancelada"],
  activa: ["por_cerrar", "cubierta", "cancelada"],
  por_cerrar: ["activa", "cubierta", "cancelada"],
  cubierta: [],
  cancelada: [],
};
