"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type {
  AIInterviewCategory,
  ApplicationQuestion,
  JobHiringProcessStep,
  JobRequirements,
  JobSourcing,
} from "@/lib/hiring";
import { RequirementsEditor } from "../_components/requirements-editor";
import { SourcingEditor } from "../_components/sourcing-editor";
import { SequenceEditor } from "../_components/sequence-editor";

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
export type SequenceWithSteps = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  steps: SequenceStep[];
};

/**
 * The Paquete dossier, organized into sub-tabs. Only the sections the
 * package actually has appear as tabs (Requisitos is always there); the
 * set therefore adapts to what the chosen kickoff prompt generated — a
 * Headhunting package shows Sourcing + Secuencia, an Inbound one shows
 * Preguntas de aplicación + Entrevista IA, etc.
 */
export function PaqueteTabs({
  jobId,
  requirements,
  sourcing,
  sequences,
  hiringProcess,
  applicationQuestions,
  aiInterviewQuestions,
  interviewScript,
}: {
  jobId: string;
  requirements: JobRequirements;
  sourcing: JobSourcing | null;
  sequences: SequenceWithSteps[];
  hiringProcess: JobHiringProcessStep[] | null;
  applicationQuestions: ApplicationQuestion[] | null;
  aiInterviewQuestions: AIInterviewCategory[] | null;
  interviewScript: string | null;
}) {
  const t = useT();
  const tabs: Array<{ key: string; label: string; render: () => ReactNode }> =
    [];

  tabs.push({
    key: "req",
    label: t("kickoff.tabRequirements"),
    render: () => <RequirementsEditor jobId={jobId} initial={requirements} />,
  });
  if (sourcing) {
    tabs.push({
      key: "sourcing",
      label: t("kickoff.tabSourcing"),
      render: () => <SourcingEditor jobId={jobId} initial={sourcing} />,
    });
  }
  if (sequences.length > 0) {
    tabs.push({
      key: "seq",
      label: t("kickoff.tabSequence"),
      render: () => <SequenceEditor sequences={sequences} />,
    });
  }
  if (hiringProcess && hiringProcess.length > 0) {
    tabs.push({
      key: "proc",
      label: t("kickoff.tabProcess"),
      render: () => <ProcessBlock steps={hiringProcess} />,
    });
  }
  if (applicationQuestions && applicationQuestions.length > 0) {
    tabs.push({
      key: "appq",
      label: t("kickoff.tabApplicationQuestions"),
      render: () => <AppQuestionsBlock questions={applicationQuestions} />,
    });
  }
  if (aiInterviewQuestions && aiInterviewQuestions.length > 0) {
    tabs.push({
      key: "aiq",
      label: t("kickoff.tabAiInterview"),
      render: () => <AiQuestionsBlock categories={aiInterviewQuestions} />,
    });
  }
  if (interviewScript) {
    tabs.push({
      key: "script",
      label: t("kickoff.tabScript"),
      render: () => <ScriptBlock markdown={interviewScript} />,
    });
  }

  const [active, setActive] = useState(tabs[0]?.key ?? "req");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              active === t.key
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{current?.render()}</div>
    </div>
  );
}

function ProcessBlock({ steps }: { steps: JobHiringProcessStep[] }) {
  return (
    <ol className="space-y-2">
      {steps
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
  );
}

function AppQuestionsBlock({ questions }: { questions: ApplicationQuestion[] }) {
  const t = useT();
  return (
    <ol className="space-y-2">
      {questions.map((q, i) => (
        <li key={i} className="rounded-md border border-border bg-bg-1 p-3">
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
              {q.type === "eliminatory"
                ? t("kickoff.questionEliminatory")
                : t("kickoff.questionInformative")}
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
  );
}

function AiQuestionsBlock({
  categories,
}: {
  categories: AIInterviewCategory[];
}) {
  return (
    <ul className="space-y-2">
      {categories.map((cat, i) => (
        <li key={i} className="rounded-md border border-border bg-bg-1 p-3">
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
                  <span className="text-muted-foreground">— {c.question}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ScriptBlock({ markdown }: { markdown: string }) {
  return (
    <pre className="whitespace-pre-wrap rounded-md border border-border bg-bg-1 p-3 text-xs leading-relaxed text-foreground">
      {markdown}
    </pre>
  );
}
