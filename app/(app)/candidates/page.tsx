import { hiring } from "@/lib/hiring";
import { Card, CardContent } from "@/components/ui/card";
import { CandidatesTable, type CandidateListRow } from "./candidates-table";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const db = await hiring();

  // Talent pool: every candidate in the workspace + their applications
  // with the job title for context. Limited to 500 for now; we'll add
  // server-side pagination when an agency outgrows that.
  const { data, error } = await db
    .from("candidates")
    .select(
      `
      id, full_name, email, phone, linkedin_url, resume_url,
      default_source, created_at,
      applications:applications(
        id, job_id, applied_at, status_changed_at,
        job:jobs(id, title)
      )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const candidates = ((data ?? []) as CandidateListRow[]).map((c) => ({
    ...c,
    applications: (c.applications ?? []).slice().sort((a, b) =>
      (b.applied_at ?? "").localeCompare(a.applied_at ?? ""),
    ),
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Candidatos</h1>
          <p className="text-sm text-muted-foreground">
            Base de talento del workspace — todos los candidatos a lo largo
            de tus vacantes.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mb-3 text-sm text-red-600">
          No se pudo cargar: {error.message}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Aún no hay candidatos. Cuando agregues uno a una vacante,
            aparecerá aquí también.
          </CardContent>
        </Card>
      ) : (
        <CandidatesTable candidates={candidates} />
      )}
    </main>
  );
}
