import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  hiring,
  type AIInterviewCategory,
  type ApplicationQuestion,
  type JobHiringProcessStep,
  type JobRequirements,
  type JobRow,
  type JobSourcing,
} from "@/lib/hiring";
import { CollapsibleSection } from "./collapsible-section";
import { PaqueteOverviewEditor } from "./paquete-overview-editor";
import { RequirementsEditor } from "./requirements-editor";
import { SequenceEditor } from "./sequence-editor";
import { LinkedinPostEditor } from "./linkedin-post-editor";
import { SourcingEditor } from "./sourcing-editor";

export const dynamic = "force-dynamic";

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

  const hasContent = Boolean(job.overview);

  if (!hasContent) {
    return (
      <div className="py-10">
        <div className="mx-auto max-w-xl rounded-md border border-dashed border-border bg-card px-6 py-10 text-center">
          <h2 className="text-base font-semibold">Aún no hay Paquete</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Corre el Kickoff con el botón en el header para popular el
            paquete (resumen, requisitos, secuencia de contacto, post de
            LinkedIn y checklist).
          </p>
        </div>
      </div>
    );
  }

  // Fetch outreach sequences for this job.
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

  const requirements = (job.requirements ?? { must: [], nice: [] }) as JobRequirements;
  const sourcing = (job.sourcing ?? null) as JobSourcing | null;
  const hiringProcess = (job.hiring_process ?? null) as
    | JobHiringProcessStep[]
    | null;
  const applicationQuestions =
    (job.screening_questions as unknown as ApplicationQuestion[] | null) ??
    null;
  const aiInterviewQuestions =
    (job.interview_questions as unknown as AIInterviewCategory[] | null) ??
    null;
  const interviewScript =
    (job.interview_script as { markdown?: string } | null)?.markdown ?? null;

  const showSourcing = job.role_type !== "inbound_ai_driven";
  const showAiBlocks = job.role_type !== "full_headhunting";

  return (
    <div className="space-y-3 py-4">
      <CollapsibleSection title="Resumen" defaultOpen>
        <PaqueteOverviewEditor
          job={job}
          mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Requisitos"
        rightSlot={
          <span className="text-[10px] text-muted-foreground">
            {requirements.must.length} imprescindibles ·{" "}
            {requirements.nice.length} deseables
          </span>
        }
      >
        <RequirementsEditor jobId={job.id} initial={requirements} />
      </CollapsibleSection>

      {showSourcing && sourcing ? (
        <CollapsibleSection
          title="Sourcing Guidelines"
          rightSlot={
            <span className="text-[10px] text-muted-foreground">
              {sourcing.criteria.length} criteria ·{" "}
              {sourcing.questions.length} questions ·{" "}
              {sourcing.target_companies.length} target companies
            </span>
          }
        >
          <SourcingEditor jobId={job.id} initial={sourcing} />
        </CollapsibleSection>
      ) : null}

      {hiringProcess && hiringProcess.length > 0 ? (
        <CollapsibleSection
          title="Proceso de entrevistas del cliente"
          rightSlot={
            <span className="text-[10px] text-muted-foreground">
              {hiringProcess.length} etapas
            </span>
          }
        >
          <ol className="space-y-2">
            {hiringProcess
              .slice()
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((stage, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px]">
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
          <p className="mt-3 text-[10px] text-muted-foreground">
            Edición inline próximamente.
          </p>
        </CollapsibleSection>
      ) : null}

      {showAiBlocks && applicationQuestions && applicationQuestions.length > 0 ? (
        <CollapsibleSection
          title="Application Questions"
          rightSlot={
            <span className="text-[10px] text-muted-foreground">
              {applicationQuestions.length} preguntas
            </span>
          }
        >
          <ol className="space-y-2">
            {applicationQuestions.map((q, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {i + 1}
                  </span>
                  <span
                    className={
                      q.type === "eliminatory"
                        ? "rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700"
                        : "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                    }
                  >
                    {q.type === "eliminatory" ? "Eliminatoria" : "Preferencial"}
                  </span>
                </div>
                <p className="text-sm font-medium">{q.question}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {q.requirement}
                </p>
                {q.auto_reject_rule ? (
                  <p className="mt-1 text-[10px] text-red-700">
                    Auto-reject: {q.auto_reject_rule}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Edición inline próximamente.
          </p>
        </CollapsibleSection>
      ) : null}

      {showAiBlocks && aiInterviewQuestions && aiInterviewQuestions.length > 0 ? (
        <CollapsibleSection
          title="AI Interview Questions"
          rightSlot={
            <span className="text-[10px] text-muted-foreground">
              {aiInterviewQuestions.reduce(
                (sum, c) => sum + (c.criteria?.length ?? 0),
                0,
              )}{" "}
              criterios en {aiInterviewQuestions.length} categorías
            </span>
          }
        >
          <div className="space-y-4">
            {aiInterviewQuestions.map((cat, i) => (
              <div key={i}>
                <h4 className="text-xs font-semibold uppercase tracking-wide">
                  {cat.category}
                </h4>
                {cat.description ? (
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    {cat.description}
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {cat.criteria.map((c, j) => (
                    <li
                      key={j}
                      className="rounded-md border border-border bg-background p-3 text-sm"
                    >
                      <div className="mb-1 text-xs font-medium">{c.name}</div>
                      <p className="text-sm">{c.question}</p>
                      <div className="mt-2 grid gap-1.5 text-xs md:grid-cols-2">
                        <div>
                          <span className="font-medium text-green-700">
                            Strong:
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {c.strong}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-red-700">
                            Weak:
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {c.weak}
                          </span>
                        </div>
                      </div>
                      {c.rationale ? (
                        <p className="mt-2 text-[11px] italic text-muted-foreground">
                          {c.rationale}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Edición inline próximamente.
          </p>
        </CollapsibleSection>
      ) : null}

      {interviewScript ? (
        <CollapsibleSection title="Talental Interview">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {interviewScript}
          </pre>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Edición inline próximamente.
          </p>
        </CollapsibleSection>
      ) : null}

      {sequences.length > 0 ? (
        <CollapsibleSection
          title="Secuencia de contacto"
          rightSlot={
            <span className="text-[10px] text-muted-foreground">
              {sequences[0].steps.length} pasos ·{" "}
              {sequences.length > 1
                ? `${sequences.length} versiones`
                : "1 versión"}
            </span>
          }
        >
          <SequenceEditor sequences={sequences} />
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection title="Post de LinkedIn">
        <LinkedinPostEditor jobId={job.id} initial={job.linkedin_post ?? ""} />
      </CollapsibleSection>

      {job.assessment_content ? (
        <CollapsibleSection title="Assessment">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {job.assessment_content}
          </pre>
          {job.assessment_link ? (
            <a
              href={job.assessment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-foreground hover:underline"
            >
              Abrir link del assessment <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
