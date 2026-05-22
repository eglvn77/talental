import Link from "next/link";
import { Upload } from "lucide-react";
import { hiring } from "@/lib/hiring";
import { CandidatesTable, type CandidateListRow } from "./candidates-table";
import { EmptyState } from "../_components/empty-state";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const db = await hiring();

  // Talent pool: every candidate in the workspace + their applications
  // with the job title for context. Capped at 2000 — well below what
  // any current agency hits, and the client-side filter/sort + 100-row
  // chunks below keeps render cost flat. When a workspace genuinely
  // outgrows 2k we'll switch to server-side cursor pagination + add
  // @tanstack/react-virtual for the long list; cap exists so a bug
  // can't pull millions of rows into memory.
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
    .limit(2000);

  const candidates = ((data ?? []) as CandidateListRow[]).map((c) => ({
    ...c,
    applications: (c.applications ?? []).slice().sort((a, b) =>
      (b.applied_at ?? "").localeCompare(a.applied_at ?? ""),
    ),
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Candidatos</h1>
          <p className="text-sm text-muted-foreground">
            Base de talento del workspace — todos los candidatos a lo largo
            de tus vacantes.
          </p>
        </div>
        <Link
          href="/candidates/import"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-foreground/[0.04]"
        >
          <Upload className="h-3.5 w-3.5" />
          Importar CSV
        </Link>
      </div>

      {error ? (
        <p className="mb-3 text-sm text-red-600">
          No se pudo cargar: {error.message}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <EmptyState
          title="Aún no hay candidatos"
          description="Agrega uno a una vacante o importa un CSV con tu talent pool actual."
          action={{ label: "Importar CSV", href: "/candidates/import" }}
        />
      ) : (
        <CandidatesTable candidates={candidates} />
      )}
    </main>
  );
}
