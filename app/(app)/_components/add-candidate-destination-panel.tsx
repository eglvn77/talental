"use client";

import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import type { CandidateSource } from "@/lib/hiring";

/**
 * Destination panel rendered at the top of each method-specific
 * "add candidate" dialog. Was previously shown inside the method
 * picker — moved here so the picker stays focused on "how to add"
 * and the downstream method dialog handles "from where + to which
 * stage".
 *
 * - source: always shown.
 * - stage:  only when a target vacante is set (jobId resolved upstream)
 *           AND that vacante has stages.
 *
 * State lives upstream in <AddCandidatesHost/>; the panel is purely
 * presentational + controlled.
 */

const SOURCES: CandidateSource[] = [
  "linkedin",
  "indeed",
  "referral",
  "direct",
  "other",
  "bulk_import",
];
const SOURCE_KEY: Record<CandidateSource, string> = {
  linkedin: "candidateImport.sourceLinkedin",
  indeed: "candidateImport.sourceIndeed",
  referral: "candidateImport.sourceReferral",
  direct: "candidateImport.sourceDirect",
  other: "candidateImport.sourceOther",
  bulk_import: "candidateImport.sourceBulkImport",
};

export function AddCandidateDestinationPanel({
  source,
  onSourceChange,
  stages,
  stageId,
  onStageChange,
}: {
  source: CandidateSource;
  onSourceChange: (next: CandidateSource) => void;
  /** Stages of the target vacante. Empty (or undefined) hides the
   *  stage select — pool-only flows don't need a stage. */
  stages?: Array<{ id: string; name: string }>;
  stageId: string;
  onStageChange: (next: string) => void;
}) {
  const t = useT();
  const showStage = (stages?.length ?? 0) > 0;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={t("candidateImport.destSource")}>
        <Select
          value={source}
          onChange={(v) => onSourceChange(v as CandidateSource)}
          options={SOURCES.map((s) => ({
            value: s,
            label: t(SOURCE_KEY[s]),
          }))}
        />
      </Field>
      {showStage ? (
        <Field label={t("candidateImport.destStage")}>
          <Select
            value={stageId}
            onChange={onStageChange}
            options={stages!.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
