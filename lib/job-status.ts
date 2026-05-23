import { type JobRow, type JobStatus } from "@/lib/hiring";
import type { PillProps } from "@/components/ui/pill";

/**
 * Spanish labels for `hiring.jobs.status`. Sentence case per Distillate.
 * Single source of truth shared by the status badge and the select dropdown.
 */
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  borrador: "Borrador",
  activa: "Activa",
  por_cerrar: "Por cerrar",
  cubierta: "Cubierta",
  cancelada: "Cancelada",
};

/**
 * Job status mapped to the canonical Distillate <Pill> tone palette.
 * No raw hex — every status uses tokens that adapt to dark mode for free.
 *
 *  - borrador   → neutral (stone tint) — not published yet
 *  - activa     → success (moss)       — live and recruiting
 *  - por_cerrar → warning (ochre)      — winding down
 *  - cubierta   → accent (olive)       — successful close, the brand
 *                                         moment for a job that landed
 *  - cancelada  → danger (wine)        — abandoned
 */
export const JOB_STATUS_TONE: Record<JobStatus, PillProps["tone"]> = {
  borrador: "neutral",
  activa: "success",
  por_cerrar: "warning",
  cubierta: "accent",
  cancelada: "danger",
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
