import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import {
  hiring,
  type JobStatusRow,
  type CompanyStatusRow,
} from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
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
export default async function JobStatusesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const t = await getT();
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");
  // ?scope=company surfaces the company statuses (Companies module);
  // anything else (incl. none) shows job statuses (Jobs module).
  const scope = (await searchParams).scope === "company" ? "company" : "job";

  const db = await hiring();
  const [{ data: rows }, { data: companyRows }] = await Promise.all([
    db.from("job_statuses").select("*").order("position", { ascending: true }),
    db
      .from("company_statuses")
      .select("*")
      .order("position", { ascending: true }),
  ]);
  const statuses = (rows ?? []) as JobStatusRow[];
  const companyStatuses = (companyRows ?? []) as CompanyStatusRow[];

  // Usage counts per job status_id — aggregated client-side.
  const usageCounts: Record<string, number> = {};
  if (statuses.length > 0) {
    const { data: counts } = await db.from("jobs").select("status_id");
    for (const row of (counts ?? []) as Array<{ status_id: string }>) {
      usageCounts[row.status_id] = (usageCounts[row.status_id] ?? 0) + 1;
    }
  }

  // Usage counts per company status KEY (companies.status is the key).
  const companyUsage: Record<string, number> = {};
  if (companyStatuses.length > 0) {
    const { data: counts } = await db.from("companies").select("status");
    for (const row of (counts ?? []) as Array<{ status: string }>) {
      companyUsage[row.status] = (companyUsage[row.status] ?? 0) + 1;
    }
  }

  return (
    <>
      <SettingsTabsServer />
      <div className="space-y-8">
        {scope === "job" ? (
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">
                {t("jobStatusesCfg.jobStatusesHeading")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("jobStatusesCfg.jobStatusesDescription")}
              </p>
            </div>
            <JobStatusesList
              initialStatuses={statuses}
              usageCounts={usageCounts}
            />
          </section>
        ) : (
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">
                {t("jobStatusesCfg.companyStatusesHeading")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("jobStatusesCfg.companyStatusesDescription")}
              </p>
            </div>
            <CompanyStatusesList
              initialStatuses={companyStatuses}
              usageCounts={companyUsage}
            />
          </section>
        )}
      </div>
    </>
  );
}
