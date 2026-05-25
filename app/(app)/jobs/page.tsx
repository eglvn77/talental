import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { hiring, type CompanyRow, type JobRow } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { JobsTable } from "./jobs-table";
import { EmptyState } from "../_components/empty-state";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const me = await getCurrentUser();
  const canCreate = me ? isAdmin(me.team_member) : false;
  const db = await hiring();
  const { data: jobsData, error } = await db
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  const jobs = (jobsData ?? []) as JobRow[];

  // Hydrate company rows for the "Cliente" column + filter dropdown.
  const companyIds = Array.from(
    new Set(jobs.map((j) => j.company_id).filter((v): v is string => Boolean(v))),
  );
  const companiesById: Record<string, CompanyRow> = {};
  if (companyIds.length > 0) {
    const { data: companies } = await db
      .from("companies")
      .select("*")
      .in("id", companyIds);
    for (const c of (companies ?? []) as CompanyRow[]) {
      companiesById[c.id] = c;
    }
  }

  // Application counts per job.
  const candidateCounts: Record<string, number> = {};
  if (jobs.length > 0) {
    const { data: appRows } = await db
      .from("applications")
      .select("job_id")
      .in(
        "job_id",
        jobs.map((j) => j.id),
      );
    for (const r of (appRows ?? []) as { job_id: string }[]) {
      candidateCounts[r.job_id] = (candidateCounts[r.job_id] ?? 0) + 1;
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Vacantes</h1>
        {/* Icon-only quick-create button — same shape as the per-
            job "Agregar candidatos" trigger: olive square, entity
            icon from the sidebar (Briefcase) with a tiny `+` badge
            tucked in the corner, tooltip says the full label on
            hover. Admin-only — recruiters can't create vacantes
            (they'd grant themselves access by being the assignee). */}
        {canCreate ? (
          <Link
            href="/jobs/new"
            aria-label="Nueva vacante"
            title="Nueva vacante"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-fg-on-accent transition-colors hover:bg-accent/90"
          >
            <Briefcase className="h-4 w-4" />
            <Plus
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent stroke-[3] ring-2 ring-bg-1"
              aria-hidden
            />
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-600">No se pudo cargar: {error.message}</p>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title="Aún no hay vacantes"
          description="Abre tu primera vacante en 2 campos."
          action={{ label: "+ Nueva vacante", href: "/jobs/new" }}
        />
      ) : (
        <JobsTable
          jobs={jobs}
          companiesById={companiesById}
          candidateCounts={candidateCounts}
        />
      )}
    </main>
  );
}
