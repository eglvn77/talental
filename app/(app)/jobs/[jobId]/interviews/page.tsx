import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  hiring,
  type AIInterviewCategory,
  type ApplicationQuestion,
  type JobRow,
} from "@/lib/hiring";
import { CollapsibleSection } from "../_components/collapsible-section";

export const dynamic = "force-dynamic";

export default async function JobInterviewsPage({
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
        <div className="mx-auto max-w-xl rounded-md border border-dashed border-border bg-card px-6 py-10 text-center">
          <h2 className="text-base font-semibold">Aún no hay Entrevistas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Corre el Kickoff para generar las preguntas de aplicación,
            entrevista con AI y el guion de la Talental Interview.
          </p>
        </div>
      </div>
    );
  }

  const applicationQuestions =
    (job.screening_questions as unknown as ApplicationQuestion[] | null) ??
    null;
  const aiInterviewQuestions =
    (job.interview_questions as unknown as AIInterviewCategory[] | null) ??
    null;
  const interviewScript =
    (job.interview_script as { markdown?: string } | null)?.markdown ?? null;

  const showAiBlocks = job.role_type !== "full_headhunting";

  return (
    <div className="space-y-3 py-4">
      {showAiBlocks &&
      applicationQuestions &&
      applicationQuestions.length > 0 ? (
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Application Questions
          </h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            {applicationQuestions.length} preguntas — filtro inicial al postular.
          </p>
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
        </section>
      ) : null}

      {showAiBlocks &&
      aiInterviewQuestions &&
      aiInterviewQuestions.length > 0 ? (
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            AI Interview Questions
          </h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            {aiInterviewQuestions.reduce(
              (sum, c) => sum + (c.criteria?.length ?? 0),
              0,
            )}{" "}
            criterios en {aiInterviewQuestions.length} categorías.
          </p>
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
        </section>
      ) : null}

      {interviewScript ? (
        <CollapsibleSection title="Entrevista Talental">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {interviewScript}
          </pre>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Edición inline próximamente.
          </p>
        </CollapsibleSection>
      ) : null}

      {job.assessment_content ? (
        <CollapsibleSection title="Caso práctico">
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
              Abrir link del caso práctico <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
