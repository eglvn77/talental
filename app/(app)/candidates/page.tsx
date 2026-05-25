import Link from "next/link";
import { Sparkles } from "lucide-react";
import { hiring } from "@/lib/hiring";
import { CandidatesTable, type CandidateListRow } from "./candidates-table";
import { EmptyState } from "../_components/empty-state";
import { loadCandidateProfile } from "./load-candidate-profile";
import { CandidateProfileSlideover } from "./candidate-profile-slideover";
import { AddCandidateMenu } from "../jobs/[jobId]/add-candidate-menu";

export const dynamic = "force-dynamic";

const MAX_RECENT_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ recent?: string; candidate?: string }>;
}) {
  const params = await searchParams;
  const recentIds = parseRecentIds(params.recent);
  const slideoverId =
    params.candidate && UUID_RE.test(params.candidate)
      ? params.candidate
      : null;
  const slideoverBundle = slideoverId
    ? await loadCandidateProfile(slideoverId)
    : null;

  const db = await hiring();

  // Talent pool: every candidate in the workspace + their applications
  // with the job title for context. Capped at 2000 — well below what
  // any current agency hits, and the client-side filter/sort + 100-row
  // chunks below keeps render cost flat.
  //
  // The `?recent=<ids>` query param no longer filters the list (that
  // hid existing candidates and surprised users). Instead, we pass the
  // ids to the table for a "Nuevo" pill on those rows. Default sort
  // is created_at desc so the just-imported ones already float on top.
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
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Candidatos</h1>
        {/* Same dropdown as the per-vacante header (Manualmente /
            CVs / LinkedIn / CSV). Mounting without `jobId` runs the
            same flows in talent-pool mode — candidates land in the
            pool without applications. */}
        <AddCandidateMenu />
      </div>

      {recentIds && recentIds.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-positive-soft bg-positive-soft/40 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-positive">
            <Sparkles className="h-3.5 w-3.5" />
            {recentIds.length} candidato{recentIds.length === 1 ? "" : "s"}{" "}
            recién agregado{recentIds.length === 1 ? "" : "s"} — marcado
            {recentIds.length === 1 ? "" : "s"} como &quot;Nuevo&quot; arriba
          </span>
          <Link
            href="/candidates"
            className="text-muted-foreground hover:text-foreground"
          >
            Limpiar
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
          title="Aún no hay candidatos"
          description="Usa el botón 'Agregar candidatos' de arriba — manual, CVs, LinkedIn o CSV."
        />
      ) : (
        <CandidatesTable
          candidates={candidates}
          recentIds={recentIds ?? undefined}
        />
      )}

      {slideoverBundle ? (
        <CandidateProfileSlideover
          candidate={slideoverBundle.candidate}
          companiesById={slideoverBundle.companiesById}
          applications={slideoverBundle.applications}
          notes={slideoverBundle.notes}
          mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
        />
      ) : null}
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
