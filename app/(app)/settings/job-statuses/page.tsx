import { redirect } from "next/navigation";
import { hiring, type JobStatusRow } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { resolveCompanyStatusConfig } from "@/lib/company-status";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { JobStatusesList } from "./_components/job-statuses-list";
import { CompanyStatusesList } from "./_components/company-statuses-list";

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
  const [{ data: rows }, { data: wsRow }] = await Promise.all([
    db.from("job_statuses").select("*").order("position", { ascending: true }),
    db.from("workspaces").select("company_status_config").maybeSingle(),
  ]);
  const statuses = (rows ?? []) as JobStatusRow[];
  const companyStatusConfig = resolveCompanyStatusConfig(
    wsRow?.company_status_config ?? null,
  );

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
      <div className="space-y-8">
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Estatus de vacantes</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Estados por los que pasa una vacante en su ciclo de vida.
              Personaliza nombre y color, agrega estatus nuevos (cada uno
              ligado a un comportamiento). Los estatus del sistema se
              pueden renombrar pero no eliminar.
            </p>
          </div>
          <JobStatusesList initialStatuses={statuses} usageCounts={usageCounts} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Estatus de empresas</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Clasificación de tus empresas en el CRM. Son cuatro fijos
              (no se agregan ni eliminan); puedes renombrarlos y
              cambiarles el color.
            </p>
          </div>
          <CompanyStatusesList initial={companyStatusConfig} />
        </section>
      </div>
    </>
  );
}
