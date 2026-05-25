import { notFound } from "next/navigation";
import {
  hiring,
  type AIInterviewCategory,
  type ApplicationQuestion,
  type JobHiringProcessStep,
  type JobRequirements,
  type JobRow,
  type JobSourcing,
} from "@/lib/hiring";
import { EmptyState } from "@/app/(app)/_components/empty-state";
import { OverviewEditor } from "../_components/overview-editor";
import { RequirementsEditor } from "../_components/requirements-editor";
import { SourcingEditor } from "../_components/sourcing-editor";
import { SequenceEditor } from "../_components/sequence-editor";

export const dynamic = "force-dynamic";

/**
 * /jobs/[id]/paquete — the recruiter's internal dossier for a
 * vacante. Consolidates everything that used to live in four
 * separate tabs (Resumen, Requisitos, Búsqueda y Contacto,
 * Entrevistas) onto a single scrollable page so the reading flow
 * is "open the vacante → scan its full package in one pass" rather
 * than tab-hopping between fragments.
 *
 * Visual chrome is deliberately light: each block is just an inline
 * `<h2>` label + the existing editor — no card surrounds, no
 * collapsibles. Mirrors the "less section chrome" feedback on the
 * Publicación / Ajustes tabs.
 */
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

export default async function JobPaquetePage({
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

  if (!job.overview) {
    return (
      <div className="py-10">
        <EmptyState
          title="Aún no hay paquete"
          description="Corre el Kickoff con el botón en el header para popular el paquete completo."
          variant="dashed"
        />
      </div>
    );
  }

  const requirements =
    (job.requirements ?? { must: [], nice: [] }) as JobRequirements;
  const sourcing = (job.sourcing ?? null) as JobSourcing | null;
  const hiringProcess =
    (job.hiring_process ?? null) as JobHiringProcessStep[] | null;
  const applicationQuestions =
    (job.screening_questions as unknown as ApplicationQuestion[] | null) ??
    null;
  const aiInterviewQuestions =
    (job.interview_questions as unknown as AIInterviewCategory[] | null) ??
    null;
  const interviewScript =
    (job.interview_script as { markdown?: string } | null)?.markdown ?? null;

  // Outreach sequences attached to this vacante. Pulled here so the
  // SequenceEditor can mount inline at the bottom of the page —
  // mirrors the old /outreach query.
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

  const showAiBlocks = job.role_type !== "full_headhunting";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 py-6">
      <Block title="Configuración del rol">
        <OverviewEditor
          job={job}
          mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
        />
      </Block>

      <Block title="Requisitos">
        <RequirementsEditor jobId={job.id} initial={requirements} />
      </Block>

      {sourcing ? (
        <Block
          title="Guía de sourcing"
          subtitle={`${sourcing.criteria.length} criterios · ${sourcing.questions.length} preguntas · ${sourcing.target_companies.length} target companies`}
        >
          <SourcingEditor jobId={job.id} initial={sourcing} />
        </Block>
      ) : null}

      {sequences.length > 0 ? (
        <Block
          title="Secuencia de contacto"
          subtitle={`${sequences[0].steps.length} pasos${
            sequences.length > 1 ? ` · ${sequences.length} versiones` : ""
          }`}
        >
          <SequenceEditor sequences={sequences} />
        </Block>
      ) : null}

      {hiringProcess && hiringProcess.length > 0 ? (
        <Block
          title="Proceso de evaluación"
          subtitle={`${hiringProcess.length} etapas`}
        >
          <ol className="space-y-2">
            {hiringProcess
              .slice()
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((stage, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-md border border-border bg-bg-1 p-3 text-sm"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-bg-3 font-mono text-[10px]">
                    {stage.order ?? i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{stage.who}</div>
                    <div className="text-xs text-muted-foreground">
                      {stage.focus}
                      {stage.format ? ` · ${stage.format}` : ""}
                    </div>
                  </div>
                </li>
              ))}
          </ol>
        </Block>
      ) : null}

      {showAiBlocks &&
      applicationQuestions &&
      applicationQuestions.length > 0 ? (
        <Block
          title="Application Questions"
          subtitle={`${applicationQuestions.length} preguntas — filtro inicial al postular`}
        >
          <ol className="space-y-2">
            {applicationQuestions.map((q, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-bg-1 p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {i + 1}
                  </span>
                  <span
                    className={
                      q.type === "eliminatory"
                        ? "rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-medium text-danger"
                        : "rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning"
                    }
                  >
                    {q.type === "eliminatory" ? "Eliminatoria" : "Informativa"}
                  </span>
                </div>
                <div className="text-sm">{q.question}</div>
                {q.requirement ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {q.requirement}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </Block>
      ) : null}

      {showAiBlocks &&
      aiInterviewQuestions &&
      aiInterviewQuestions.length > 0 ? (
        <Block title="AI Interview — categorías">
          <ul className="space-y-2">
            {aiInterviewQuestions.map((cat, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-bg-1 p-3"
              >
                <div className="text-sm font-medium">{cat.category}</div>
                {cat.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {cat.description}
                  </p>
                ) : null}
                {cat.criteria && cat.criteria.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {cat.criteria.map((c, j) => (
                      <li key={j}>
                        <span className="font-medium">{c.name}</span>{" "}
                        <span className="text-muted-foreground">
                          — {c.question}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {interviewScript ? (
        <Block title="Guion de entrevista (Talental Interview)">
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-bg-1 p-3 text-xs leading-relaxed text-foreground">
            {interviewScript}
          </pre>
        </Block>
      ) : null}
    </div>
  );
}

function Block({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
