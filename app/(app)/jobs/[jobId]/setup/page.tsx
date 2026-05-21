import { notFound } from "next/navigation";
import Link from "next/link";
import {
  hiring,
  type JobRow,
  type JobOverview,
  type JobRequirements,
} from "@/lib/hiring";

export const dynamic = "force-dynamic";

const ROLE_TYPE_LABEL: Record<string, string> = {
  full_headhunting: "Full Headhunting",
  hybrid_ai_hunting: "Hybrid AI + Hunting",
  inbound_ai_driven: "Inbound AI Driven",
};

export default async function JobSetupPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const db = await hiring();
  const { data } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) notFound();
  const job = data as JobRow;

  const hasContent = Boolean(job.overview);

  if (!hasContent) {
    return (
      <div className="py-10">
        <div className="mx-auto max-w-xl rounded-md border border-dashed border-border bg-card px-6 py-10 text-center">
          <h2 className="text-base font-semibold">Aún no hay kickoff</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Genera el kickoff con el botón en el header para popular esta
            sección con el JD, requirements, sourcing, AI process,
            interview script, outreach y checklist.
          </p>
        </div>
      </div>
    );
  }

  const overview = (job.overview ?? {}) as JobOverview;
  const requirements = (job.requirements ?? { must: [], nice: [] }) as JobRequirements;

  return (
    <div className="space-y-6 py-4">
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Overview
        </h2>
        <dl className="grid grid-cols-[180px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Tipo de rol</dt>
          <dd>
            {job.role_type ? ROLE_TYPE_LABEL[job.role_type] : "—"}
          </dd>
          <dt className="text-muted-foreground">Compensación</dt>
          <dd>{overview.compensation_detail || "—"}</dd>
          <dt className="text-muted-foreground">Tipo de contrato</dt>
          <dd>{overview.contract_type || "—"}</dd>
          <dt className="text-muted-foreground">Horario</dt>
          <dd>{overview.working_hours || "—"}</dd>
          <dt className="text-muted-foreground">Modalidad</dt>
          <dd>{overview.work_mode || "—"}</dd>
          <dt className="text-muted-foreground">Oficina</dt>
          <dd>{overview.office_location || "—"}</dd>
          <dt className="text-muted-foreground">Fecha de inicio target</dt>
          <dd>{overview.target_start_date || "—"}</dd>
          <dt className="text-muted-foreground">Idiomas</dt>
          <dd>{overview.language_requirements || "—"}</dd>
          {overview.notes ? (
            <>
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap">{overview.notes}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Requirements
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium">Imprescindibles</h3>
            {requirements.must.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="list-disc pl-5 text-sm">
                {requirements.must.map((m, i) => (
                  <li key={i} className="mb-1">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium">Suma puntos</h3>
            {requirements.nice.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="list-disc pl-5 text-sm">
                {requirements.nice.map((m, i) => (
                  <li key={i} className="mb-1">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Job Description (preview)</span>
          <Link
            href={`/jobs/${job.id}/description`}
            className="text-[10px] font-normal normal-case text-muted-foreground hover:text-foreground"
          >
            Editar →
          </Link>
        </h2>
        {job.public_description ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: job.public_description }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Sin JD.</p>
        )}
      </section>

      {job.linkedin_post ? (
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            LinkedIn Post
          </h2>
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {job.linkedin_post}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
