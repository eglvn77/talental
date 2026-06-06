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
import { CalibrateSectionButton } from "../_components/calibrate-section-button";
import { SourcingEditor } from "../_components/sourcing-editor";
import { SequenceEditor } from "../_components/sequence-editor";
import { type SopTaskRow } from "../_components/sop";
import {
  ProcessEditor,
  AppQuestionsEditor,
  AiInterviewEditor,
  ScriptEditor,
} from "../_components/paquete-editors";

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
  sopRowsByItemId,
  requirements,
  sourcing,
  sequences,
  hiringProcess,
  applicationQuestions,
  aiInterviewQuestions,
  interviewScript,
}: {
  jobId: string;
  /** Per-job SOP checkbox state, keyed by template-item-id. The
   *  paquete page seeds missing items so this is always complete. */
  sopRowsByItemId: Record<string, SopTaskRow>;
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

  // SOP has its own top-level job tab now (see job-tabs.tsx).
  // sopRowsByItemId still arrives in props but is unused here.
  void sopRowsByItemId;

  // Wrap a section's editor with a "Calibrate" header so the
  // recruiter can tweak that section in isolation with a free-text
  // prompt. The same pattern repeats for all 7 sections.
  const sectionHeader = (section: string, label: string) => (
    <div className="mb-3 flex items-center justify-end">
      <CalibrateSectionButton
        jobId={jobId}
        section={section}
        sectionLabel={label}
      />
    </div>
  );

  tabs.push({
    key: "req",
    label: t("kickoff.tabRequirements"),
    render: () => (
      <>
        {sectionHeader("requirements", t("kickoff.tabRequirements"))}
        <RequirementsEditor jobId={jobId} initial={requirements} />
      </>
    ),
  });
  if (sourcing) {
    tabs.push({
      key: "sourcing",
      label: t("kickoff.tabSourcing"),
      render: () => (
        <>
          {sectionHeader("sourcing", t("kickoff.tabSourcing"))}
          <SourcingEditor jobId={jobId} initial={sourcing} />
        </>
      ),
    });
  }
  if (sequences.length > 0) {
    tabs.push({
      key: "seq",
      label: t("kickoff.tabSequence"),
      render: () => (
        <>
          {sectionHeader("outreach_sequence", t("kickoff.tabSequence"))}
          <SequenceEditor sequences={sequences} />
        </>
      ),
    });
  }
  if (hiringProcess && hiringProcess.length > 0) {
    tabs.push({
      key: "proc",
      label: t("kickoff.tabProcess"),
      render: () => (
        <>
          {sectionHeader("hiring_process", t("kickoff.tabProcess"))}
          <ProcessEditor jobId={jobId} initial={hiringProcess} />
        </>
      ),
    });
  }
  if (applicationQuestions && applicationQuestions.length > 0) {
    tabs.push({
      key: "appq",
      label: t("kickoff.tabApplicationQuestions"),
      render: () => (
        <>
          {sectionHeader(
            "application_questions",
            t("kickoff.tabApplicationQuestions"),
          )}
          <AppQuestionsEditor jobId={jobId} initial={applicationQuestions} />
        </>
      ),
    });
  }
  if (aiInterviewQuestions && aiInterviewQuestions.length > 0) {
    tabs.push({
      key: "aiq",
      label: t("kickoff.tabAiInterview"),
      render: () => (
        <>
          {sectionHeader(
            "ai_interview_questions",
            t("kickoff.tabAiInterview"),
          )}
          <AiInterviewEditor jobId={jobId} initial={aiInterviewQuestions} />
        </>
      ),
    });
  }
  if (interviewScript) {
    tabs.push({
      key: "script",
      label: t("kickoff.tabScript"),
      render: () => (
        <>
          {sectionHeader(
            "talental_interview_script",
            t("kickoff.tabScript"),
          )}
          <ScriptEditor jobId={jobId} initial={interviewScript} />
        </>
      ),
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
