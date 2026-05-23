import Link from "next/link";
import { Sparkles, Upload } from "lucide-react";
import { hiring } from "@/lib/hiring";
import { CandidatesTable, type CandidateListRow } from "./candidates-table";
import { EmptyState } from "../_components/empty-state";

export const dynamic = "force-dynamic";

const MAX_RECENT_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ recent?: string }>;
}) {
  const params = await searchParams;
  const recentIds = parseRecentIds(params.recent);

  const db = await hiring();

  // Talent pool: every candidate in the workspace + their applications
  // with the job title for context. Capped at 2000 — well below what
  // any current agency hits, and the client-side filter/sort + 100-row
  // chunks below keeps render cost flat. When `?recent=<ids>` is set
  // (e.g. right after a CV bulk import) we filter the query to just
  // those rows so the recruiter lands on a focused view.
  let query = db
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
    .order("created_at", { ascending: false });

  if (recentIds && recentIds.length > 0) {
    query = query.in("id", recentIds);
  } else {
    query = query.limit(2000);
  }

  const { data, error } = await query;

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
          Importar
        </Link>
      </div>

      {recentIds && recentIds.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-positive-soft bg-positive-soft/40 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-positive">
            <Sparkles className="h-3.5 w-3.5" />
            Mostrando {candidates.length} candidato
            {candidates.length === 1 ? "" : "s"} recién agregado
            {candidates.length === 1 ? "" : "s"}
          </span>
          <Link
            href="/candidates"
            className="text-muted-foreground hover:text-foreground"
          >
            Ver todos
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 text-sm text-red-600">
          No se pudo cargar: {error.message}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <EmptyState
          title={recentIds ? "No encontré esos candidatos" : "Aún no hay candidatos"}
          description={
            recentIds
              ? "Quizá fueron borrados, o el enlace está roto. Ve todos los candidatos."
              : "Agrega uno a una vacante o importa un CSV / PDFs con tu talent pool actual."
          }
          action={
            recentIds
              ? { label: "Ver todos", href: "/candidates" }
              : { label: "Importar", href: "/candidates/import" }
          }
        />
      ) : (
        <CandidatesTable candidates={candidates} />
      )}
    </main>
  );
}

/** Parse + validate `?recent=id1,id2,id3` query param. */
function parseRecentIds(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID_RE.test(s))
    .slice(0, MAX_RECENT_IDS);
  return ids.length > 0 ? ids : null;
}
