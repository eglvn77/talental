import { type JobRow, type JobStatus } from "@/lib/hiring";

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
  borrador: { bg: "#ede4d3", fg: "#6b6258" }, // sand — not published yet
  activa: { bg: "#d8e9c4", fg: "#3f6020" }, // warm green — live & recruiting
  por_cerrar: { bg: "#f5deb3", fg: "#8a5a1f" }, // amber — winding down
  cubierta: { bg: "#e7d9c0", fg: "#6b5a36" }, // sand-gold — successful close
  cancelada: { bg: "#f4c9c2", fg: "#8a3120" }, // warm rust — abandoned
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

/**
 * A job can be moved to "Activa" when EITHER:
 *  - Kickoff has been run (overview is populated), OR
 *  - The recruiter filled the minimum manual fields: role_type AND a
 *    public_description (the JD candidates will see).
 *
 * Both paths get the vacante into a state where candidates can
 * meaningfully start being sent. The check is enforced server-side
 * in updateJobStatusAction and surfaced client-side in the status
 * dropdown.
 */
export function canActivateJob(
  job: Pick<JobRow, "overview" | "role_type" | "public_description">,
): { ok: true } | { ok: false; reason: string } {
  if (job.overview) return { ok: true };
  const missing: string[] = [];
  if (!job.role_type) missing.push("tipo de rol");
  if (!job.public_description || !job.public_description.trim()) {
    missing.push("descripción del puesto");
  }
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    reason: `Aún falta: ${missing.join(", ")}. Corre el Kickoff o llena los campos en Ajustes antes de activar.`,
  };
}
