import Link from "next/link";
import { hiring, type CompanyRow, type JobRow } from "@/lib/hiring";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const db = hiring();
  const { data: jobsData, error } = await db
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  const jobs = (jobsData ?? []) as JobRow[];

  // Hydrate company names for the "Cliente" column.
  const companyIds = Array.from(
    new Set(jobs.map((j) => j.company_id).filter((v): v is string => Boolean(v))),
  );
  const companiesById = new Map<string, CompanyRow>();
  if (companyIds.length > 0) {
    const { data: companies } = await db
      .from("companies")
      .select("*")
      .in("id", companyIds);
    for (const c of (companies ?? []) as CompanyRow[]) {
      companiesById.set(c.id, c);
    }
  }

  // Application counts per job.
  const counts = new Map<string, number>();
  if (jobs.length > 0) {
    const { data: appRows } = await db
      .from("applications")
      .select("job_id")
      .in(
        "job_id",
        jobs.map((j) => j.id),
      );
    for (const r of (appRows ?? []) as { job_id: string }[]) {
      counts.set(r.job_id, (counts.get(r.job_id) ?? 0) + 1);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vacantes</h1>
          <p className="text-sm text-muted-foreground">
            Vacantes activas y pasadas.
          </p>
        </div>
        <Link href="/jobs/new" className={cn(buttonVariants())}>
          Nueva vacante
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600">No se pudo cargar: {error.message}</p>
      ) : null}

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Aún no hay vacantes. Crea una para empezar.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Vacante</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Candidatos</th>
                <th className="px-4 py-3 font-medium">Creada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((j) => {
                const company = j.company_id
                  ? companiesById.get(j.company_id)
                  : null;
                return (
                  <tr key={j.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/jobs/${j.id}`}
                        className="hover:underline"
                      >
                        {j.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {company?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">
                        {j.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {counts.get(j.id) ?? 0}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(j.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
