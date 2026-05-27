import "server-only";

import { hiring, type JobRow, type JobStatusRow } from "@/lib/hiring";

/**
 * Workspace-scoped job statuses. Replaces the old static
 * JOB_STATUS_LABEL/VALUES/TONE maps that hardcoded the five enum
 * values. Each agency now defines its own statuses in
 * /settings/job-statuses, and the lifecycle gates (open / archived)
 * are flags on the row rather than hardcoded keys.
 *
 * The default seed gives every new workspace three statuses
 * (Borrador, Activa, Archivada) keyed as in `SystemJobStatusKey`,
 * but admins can rename / recolor / add / delete.
 */

/**
 * Active job statuses for the caller's workspace, ordered by the
 * admin-defined position. RLS scopes this to the auth'd workspace.
 */
export async function loadJobStatuses(): Promise<JobStatusRow[]> {
  const db = await hiring();
  const { data } = await db
    .from("job_statuses")
    .select("*")
    .order("position", { ascending: true });
  return (data ?? []) as JobStatusRow[];
}

/**
 * Resolve a status by its `key` slug. Useful for the platform-level
 * defaults (e.g. seeding a new job's status_id to the workspace's
 * 'borrador' row). Returns null when the workspace has renamed /
 * deleted the row; callers should fall back to position 0.
 */
export async function getJobStatusByKey(
  key: string,
): Promise<JobStatusRow | null> {
  const db = await hiring();
  const { data } = await db
    .from("job_statuses")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  return (data as JobStatusRow | null) ?? null;
}

/**
 * Resolve the default status for newly-created vacantes. Prefers
 * the 'borrador' system row; falls back to the first status by
 * position when the recruiter renamed/deleted it (so a brand-new
 * workspace + a heavily-customized one both work).
 */
export async function resolveDefaultJobStatusId(): Promise<string | null> {
  const db = await hiring();
  const { data: borrador } = await db
    .from("job_statuses")
    .select("id")
    .eq("key", "borrador")
    .maybeSingle();
  if (borrador?.id) return borrador.id as string;
  const { data: first } = await db
    .from("job_statuses")
    .select("id")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (first?.id as string | undefined) ?? null;
}

/**
 * Gate that decides whether a job is ready to move into an `is_open`
 * status (the workspace's "Activa"-equivalent). Mirrors the old
 * `canActivateJob` rules: kickoff content OR the manual minimum set.
 */
export function canOpenJob(
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
