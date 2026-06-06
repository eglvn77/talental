"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { FeedbackEditor } from "../_components/feedback-editor";
import { SourcingEditor } from "../_components/sourcing-editor";
import { SequenceEditor } from "../_components/sequence-editor";
import {
  ProcessEditor,
  AppQuestionsEditor,
  AiInterviewEditor,
  ScriptEditor,
} from "../_components/paquete-editors";
import {
  ListResourceEditor,
  MarkdownResourceEditor,
} from "../_components/custom-resource-editors";

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
 * Workspace resource definition row, ordered + filtered server-side.
 * Drives which tabs the Paquete shows and in what order.
 */
export type ResourcesTabDefinition = {
  id: string;
  key: string;
  label: string;
  kind: string;
  is_enabled: boolean;
  is_system: boolean;
  position: number;
};

/**
 * The Paquete dossier, organized into sub-tabs. The tab list comes
 * from the workspace's enabled resource_definitions (ordered by
 * position) — rename or disable any section from /settings/resources
 * and it propagates here automatically.
 *
 * Content is still pulled from the legacy hiring.jobs columns (kept
 * fresh by the mirror trigger from Phase 1). Reads will migrate to
 * resource_values when the editors take a generic value-prop in a
 * later phase.
 */
export function ResourcesTabs({
  jobId,
  definitions,
  customValues,
  requirements,
  sourcing,
  sequences,
  hiringProcess,
  applicationQuestions,
  aiInterviewQuestions,
  interviewScript,
  feedbackEntries,
}: {
  jobId: string;
  definitions: ResourcesTabDefinition[];
  /** Map of definition_id → resource_values.value for custom
   *  (non-system) definitions. Undefined means "no value row yet";
   *  generic editors render an empty initial state. */
  customValues: Record<string, unknown>;
  requirements: JobRequirements;
  sourcing: JobSourcing | null;
  sequences: SequenceWithSteps[];
  hiringProcess: JobHiringProcessStep[] | null;
  applicationQuestions: ApplicationQuestion[] | null;
  aiInterviewQuestions: AIInterviewCategory[] | null;
  interviewScript: string | null;
  /** Role Calibration History — manual feedback log per vacante. */
  feedbackEntries: Array<{
    id: string;
    job_id: string;
    body: string;
    source: "manual" | "slack" | "whatsapp" | "call" | "email" | "other";
    received_at: string;
    recorded_by_team_member_id: string | null;
    created_at: string;
  }>;
}) {
  const t = useT();
  const tabs: Array<{ key: string; label: string; render: () => ReactNode }> =
    [];

  // SOP (kind='checklist') lives on its own top-level job tab. The
  // server-side query already filters it out of `definitions`.

  // Render header with the calibrate button. Passes definitionId so
  // the calibrate action looks the section up by definition rather
  // than by hardcoded SectionKey (Phase 3c-1 bridge).
  const renderHeader = (definitionId: string, label: string) => (
    <div className="mb-3 flex items-center justify-end">
      <CalibrateSectionButton
        jobId={jobId}
        definitionId={definitionId}
        sectionLabel={label}
      />
    </div>
  );

  // Map definition.key to the existing typed editor. Each tab uses
  // the definition's `label` (so /settings/resources renames flow
  // through) and `id` (so calibrate routes via definitionId).
  for (const def of definitions) {
    switch (def.key) {
      case "requirements":
        tabs.push({
          key: "req",
          label: def.label,
          render: () => (
            <>
              {renderHeader(def.id, def.label)}
              <RequirementsEditor jobId={jobId} initial={requirements} />
            </>
          ),
        });
        break;

      case "sourcing":
        if (!sourcing) break;
        tabs.push({
          key: "sourcing",
          label: def.label,
          render: () => (
            <SourcingEditor
              jobId={jobId}
              initial={sourcing}
              headerSlot={
                <CalibrateSectionButton
                  jobId={jobId}
                  definitionId={def.id}
                  sectionLabel={def.label}
                />
              }
            />
          ),
        });
        break;

      case "outreach_sequence":
        if (sequences.length === 0) break;
        tabs.push({
          key: "seq",
          label: def.label,
          render: () => (
            <>
              {renderHeader(def.id, def.label)}
              <SequenceEditor sequences={sequences} />
            </>
          ),
        });
        break;

      case "hiring_process":
        tabs.push({
          key: "proc",
          label: def.label,
          render: () => (
            <>
              {renderHeader(def.id, def.label)}
              <ProcessEditor jobId={jobId} initial={hiringProcess ?? []} />
            </>
          ),
        });
        break;

      case "application_questions":
        if (!applicationQuestions || applicationQuestions.length === 0) break;
        tabs.push({
          key: "appq",
          label: def.label,
          render: () => (
            <>
              {renderHeader(def.id, def.label)}
              <AppQuestionsEditor jobId={jobId} initial={applicationQuestions} />
            </>
          ),
        });
        break;

      case "ai_interview_questions":
        if (!aiInterviewQuestions || aiInterviewQuestions.length === 0) break;
        tabs.push({
          key: "aiq",
          label: def.label,
          render: () => (
            <>
              {renderHeader(def.id, def.label)}
              <AiInterviewEditor
                jobId={jobId}
                initial={aiInterviewQuestions}
              />
            </>
          ),
        });
        break;

      case "talental_interview_script":
        if (!interviewScript) break;
        tabs.push({
          key: "script",
          label: def.label,
          render: () => (
            <>
              {renderHeader(def.id, def.label)}
              <ScriptEditor jobId={jobId} initial={interviewScript} />
            </>
          ),
        });
        break;

      default: {
        // Custom (non-system) definitions render a generic editor
        // chosen by `kind`. Falls back to a placeholder for kinds
        // we haven't built editors for yet (`structured`).
        const value = customValues[def.id];
        if (def.kind === "markdown") {
          tabs.push({
            key: `custom-${def.id}`,
            label: def.label,
            render: () => (
              <MarkdownResourceEditor
                jobId={jobId}
                definitionId={def.id}
                initial={typeof value === "string" ? value : ""}
              />
            ),
          });
        } else if (def.kind === "list") {
          tabs.push({
            key: `custom-${def.id}`,
            label: def.label,
            render: () => (
              <ListResourceEditor
                jobId={jobId}
                definitionId={def.id}
                initial={
                  Array.isArray(value)
                    ? (value as unknown[]).filter(
                        (x): x is string => typeof x === "string",
                      )
                    : []
                }
              />
            ),
          });
        } else {
          tabs.push({
            key: `custom-${def.id}`,
            label: def.label,
            render: () => (
              <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                {t("kickoff.customResourcePlaceholder", { kind: def.kind })}
              </div>
            ),
          });
        }
        break;
      }
    }
  }

  // Role Calibration History — always present so the recruiter can
  // log feedback even before kickoff. Not driven by a definition —
  // it's app data, not workspace-customizable resource content.
  tabs.push({
    key: "feedback",
    label: t("kickoff.tabFeedback"),
    render: () => <FeedbackEditor jobId={jobId} initial={feedbackEntries} />,
  });

  // URL-driven active tab so the Package hover-menu in <JobTabs> can
  // deep-link straight into a section (?tab=feedback, ?tab=script,
  // etc). Falls back to the first tab when no/unknown param.
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramTab = searchParams?.get("tab") ?? null;
  const [active, setActive] = useState(
    paramTab && tabs.find((t) => t.key === paramTab)
      ? paramTab
      : tabs[0]?.key ?? "req",
  );
  useEffect(() => {
    if (paramTab && paramTab !== active && tabs.find((t) => t.key === paramTab)) {
      setActive(paramTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTab]);
  function selectTab(key: string) {
    setActive(key);
    const sp = new URLSearchParams(searchParams ?? undefined);
    sp.set("tab", key);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
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
