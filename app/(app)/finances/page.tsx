import {
  hiring,
  type CompanyRow,
  type ContactRow,
  type JobRow,
  type JobStatusRow,
} from "@/lib/hiring";
import { loadJobStatuses } from "@/lib/job-status";
import { EmptyState } from "../_components/empty-state";
import { FinancesTable } from "./finances-table";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * /finances — workspace-wide financial view across vacantes.
 *
 * Replaces the external Sheets tracker. The page hydrates everything
 * the FinancesTable needs to render the per-job forecast (jobs +
 * companies + the team-member, contact, and company lookups for
 * resolving the sourcer/recruiter and lead names).
 *
 * Every projection is a forecast — actual revenue lands when a
 * placement event closes the loop. The summary strip aggregates by
 * currency since we don't FX-convert.
 */
export default async function FinancesPage() {
  const t = await getT();
  const db = await hiring();
  const [
    { data: jobsData, error },
    { data: companiesData },
    { data: contactsData },
  ] = await Promise.all([
    db
      .from("jobs")
      .select("*, status:job_statuses(*)")
      .order("created_at", { ascending: false }),
    db.from("companies").select("id, name, domain, logo_url, status"),
    db.from("contacts").select("id, full_name"),
  ]);
  const jobStatuses = await loadJobStatuses();

  const jobs = (jobsData ?? []) as Array<
    JobRow & { status: JobStatusRow | null }
  >;
  const companies = (companiesData ?? []) as Pick<
    CompanyRow,
    "id" | "name" | "domain" | "logo_url" | "status"
  >[];
  const contacts = (contactsData ?? []) as Pick<
    ContactRow,
    "id" | "full_name"
  >[];

  const companiesById: Record<
    string,
    Pick<CompanyRow, "id" | "name" | "domain" | "logo_url" | "status">
  > = {};
  for (const c of companies) companiesById[c.id] = c;
  const contactsById: Record<string, Pick<ContactRow, "id" | "full_name">> = {};
  for (const c of contacts) contactsById[c.id] = c;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">{t("crm.financesTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("crm.financesSubtitle")}
        </p>
      </div>

      {error ? (
        <p className="mb-3 text-sm text-danger">
          {t("crm.loadError", { message: error.message })}
        </p>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title={t("crm.financesEmptyTitle")}
          description={t("crm.financesEmptyDescription")}
          action={{ label: t("crm.newJob"), href: "/jobs/new" }}
        />
      ) : (
        <FinancesTable
          jobs={jobs}
          jobStatuses={jobStatuses}
          companiesById={companiesById}
          contactsById={contactsById}
        />
      )}
    </main>
  );
}
