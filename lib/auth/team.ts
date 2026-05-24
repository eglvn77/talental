import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { hiring, type TeamMemberRow } from "@/lib/hiring";

/**
 * Server-side helpers for role-based access control. Pairs with the
 * DB-side RBAC introduced in migration 20260524173646: workspace
 * admins (team_role IN owner|admin) keep full access; recruiters
 * see only what's assigned to them.
 *
 * These functions return `ActionResult`-shaped objects so server
 * actions can short-circuit cleanly:
 *
 *   const guard = await requireAdmin();
 *   if (!guard.ok) return guard;
 *
 * RLS is the source of truth — these helpers exist to give the app
 * code earlier, cleaner failure modes than "supabase update returned
 * 0 rows because RLS blocked it".
 */

export type GuardResult<T = TeamMemberRow> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ADMIN_ROLES = new Set<TeamMemberRow["team_role"]>(["owner", "admin"]);

/** Pure role check — does this row count as an admin? */
export function isAdmin(member: TeamMemberRow): boolean {
  return ADMIN_ROLES.has(member.team_role);
}

/**
 * Resolve the current request's team_member row. Wraps
 * `getCurrentUser()` (which is React-cached) and unwraps just the
 * membership for callers that don't need the workspace object.
 */
export async function requireCurrentTeamMember(): Promise<GuardResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  return { ok: true, data: user.team_member };
}

/**
 * Admin gate. Returns ok only when the current user holds
 * owner|admin in their workspace. Use for operations that
 * recruiters shouldn't be able to invoke: creating/deleting
 * vacantes, changing assignments, editing fee terms, etc.
 */
export async function requireAdmin(): Promise<GuardResult> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  if (!isAdmin(guard.data)) {
    return { ok: false, error: "Solo administradores pueden hacer esto" };
  }
  return guard;
}

/**
 * Job-scoped gate. Admin passes always; recruiter passes only when
 * they're the assigned `recruiter_team_member_id` on the job. Cheap
 * server-side check that catches unauthorized writes before they hit
 * Supabase (where RLS would also block them but with a less helpful
 * error path).
 */
export async function requireJobAccess(
  jobId: string,
): Promise<GuardResult> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const member = guard.data;
  if (isAdmin(member)) return guard;

  const db = await hiring();
  const { data, error } = await db
    .from("jobs")
    .select("id, recruiter_team_member_id")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "Vacante no encontrada" };
  }
  if (data.recruiter_team_member_id !== member.id) {
    return { ok: false, error: "No tienes acceso a esta vacante" };
  }
  return guard;
}
