import Link from "next/link";
import { Plus } from "lucide-react";
import { hiring, type CompanyRow, type JobRow } from "@/lib/hiring";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JobsTable } from "./jobs-table";
import { EmptyState } from "../_components/empty-state";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vacantes</h1>
          <p className="text-sm text-muted-foreground">
            Vacantes activas y pasadas.
          </p>
        </div>
        <Link
          href="/jobs/new"
          className={cn(buttonVariants(), "gap-1.5")}
        >
          <Plus className="h-4 w-4" />
          Agregar vacante
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600">No se pudo cargar: {error.message}</p>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title="Aún no hay vacantes"
          description="Abre tu primera vacante en 2 campos."
          action={{ label: "+ Agregar vacante", href: "/jobs/new" }}
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
