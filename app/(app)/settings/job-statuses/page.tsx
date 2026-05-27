import { redirect } from "next/navigation";
import { hiring, type JobStatusRow } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { JobStatusesList } from "./_components/job-statuses-list";

export const dynamic = "force-dynamic";

/**
 * Workspace job-status manager. Admin-only.
 *
 * Each row in hiring.job_statuses is one lifecycle state for a
 * vacante. Labels, colors, and the behavior flags (is_open,
 * is_archived) drive the chips in the kanban + table, careers
 * eligibility, and template-propagation scope. The platform seeds
 * Borrador / Activa / Archivada (is_system=true) on workspace
 * creation; admins can rename / recolor / re-flag those AND add new
 * custom ones, but the three system rows can't be deleted.
 *
 * Also pulls a usage count per row so the UI can warn before delete
 * (jobs in active use block the action server-side).
 */
export default async function JobStatusesPage() {
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");

  const db = await hiring();
  const { data: rows } = await db
    .from("job_statuses")
    .select("*")
    .order("position", { ascending: true });
  const statuses = (rows ?? []) as JobStatusRow[];

  // Usage counts per status_id — single round trip via aggregating
  // on the client side after the head:false select.
  const usageCounts: Record<string, number> = {};
  if (statuses.length > 0) {
    const { data: counts } = await db
      .from("jobs")
      .select("status_id");
    for (const row of (counts ?? []) as Array<{ status_id: string }>) {
      usageCounts[row.status_id] = (usageCounts[row.status_id] ?? 0) + 1;
    }
  }

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Estados que pueden tener tus vacantes a lo largo de su ciclo de
          vida. Personaliza el nombre, color, y si cada estado cuenta como
          &ldquo;abierto al público&rdquo; (publicable en /careers) o como
          &ldquo;archivado&rdquo; (no recibe ediciones de los templates de
          pipeline). Los estados del sistema se pueden renombrar pero no
          eliminar.
        </p>
        <JobStatusesList initialStatuses={statuses} usageCounts={usageCounts} />
      </section>
    </>
  );
}
