import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Mail, Linkedin, MessageSquare } from "lucide-react";
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

type SequenceStep = {
  id: string;
  position: number;
  kind: string;
  delay_minutes: number | null;
  subject_template: string | null;
  body_template: string | null;
  task_title: string | null;
  task_body: string | null;
  config: { channel?: string } | null;
};

type SequenceWithSteps = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  steps: SequenceStep[];
};

const CHANNEL_LABEL: Record<string, { label: string; Icon: typeof Mail }> = {
  email: { label: "Email", Icon: Mail },
  linkedin_invitation: { label: "LinkedIn Invitation", Icon: Linkedin },
  linkedin_inmail: { label: "LinkedIn InMail", Icon: Linkedin },
  linkedin_message: { label: "LinkedIn Message", Icon: MessageSquare },
};

function describeDelay(minutes: number | null): string {
  if (!minutes) return "Inmediato";
  const hours = Math.round(minutes / 60);
  if (hours === 0) return `+${minutes} min`;
  if (hours < 24) return `+${hours}h`;
  const days = Math.round(hours / 24);
  return `+${days}d`;
}

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
            Corre el Kickoff con el botón en el header para popular esta
            sección con el JD, requirements, sourcing, AI process,
            interview script, outreach y checklist.
          </p>
        </div>
      </div>
    );
  }

  // Fetch outreach sequences for this job — kickoff inserts one each run.
  const { data: seqRows } = await db
    .from("sequences")
    .select("id, name, status, created_at")
    .eq("default_job_id", jobId)
    .order("created_at", { ascending: false });
  const sequenceShells = (seqRows ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }>;

  let sequences: SequenceWithSteps[] = [];
  if (sequenceShells.length > 0) {
    const seqIds = sequenceShells.map((s) => s.id);
    const { data: stepRows } = await db
      .from("sequence_steps")
      .select("*")
      .in("sequence_id", seqIds)
      .order("position", { ascending: true });
    const allSteps = (stepRows ?? []) as Array<
      SequenceStep & { sequence_id: string }
    >;
    sequences = sequenceShells.map((s) => ({
      ...s,
      steps: allSteps.filter((st) => st.sequence_id === s.id),
    }));
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
          <dd>{job.role_type ? ROLE_TYPE_LABEL[job.role_type] : "—"}</dd>
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
          {job.assessment_link ? (
            <>
              <dt className="text-muted-foreground">Assessment</dt>
              <dd>
                <a
                  href={job.assessment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-foreground hover:underline"
                >
                  Abrir <ExternalLink className="h-3 w-3" />
                </a>
              </dd>
            </>
          ) : null}
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

      {sequences.length > 0 ? (
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Outreach Sequence
          </h2>
          {sequences.map((seq) => (
            <div key={seq.id} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">{seq.name}</span>
                <span>
                  {seq.status} ·{" "}
                  {new Date(seq.created_at).toLocaleDateString("es-MX")}
                </span>
              </div>
              <ol className="space-y-3">
                {seq.steps.map((step) => {
                  const channelKey =
                    (step.config?.channel as string | undefined) ?? step.kind;
                  const meta =
                    CHANNEL_LABEL[channelKey] ??
                    CHANNEL_LABEL[step.kind] ?? {
                      label: step.kind,
                      Icon: Mail,
                    };
                  const Icon = meta.Icon;
                  const body =
                    step.body_template ?? step.task_body ?? "(vacío)";
                  return (
                    <li
                      key={step.id}
                      className="rounded-md border border-border bg-background p-3"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {step.position}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        <span className="text-muted-foreground">
                          {describeDelay(step.delay_minutes)}
                        </span>
                        {step.subject_template ? (
                          <span className="truncate text-muted-foreground">
                            · <em>{step.subject_template}</em>
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {body}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      ) : null}

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
