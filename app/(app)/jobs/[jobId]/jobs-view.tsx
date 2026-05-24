"use client";

import { useEffect, useState } from "react";
import {
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import { useLocalColumns } from "../../_components/table-controls";
import { PipelineBoard } from "./pipeline-board";
import { CandidatesListView } from "./candidates-list-view";
import { StageChips } from "./_components/stage-chips";
import {
  VistaPopover,
  type VistaColumnDef,
} from "./_components/vista-popover";

type View = "kanban" | "list";

/**
 * Toggleable columns in the list view. The "Nombre" column is the
 * primary identity and stays locked — every other column can be
 * hidden via the Vista popover.
 *
 * The keys mirror the strings <CandidatesListView> checks against
 * its `hiddenCols` Set. Email defaults to hidden because the name
 * column already inlines it underneath when the Email column is off.
 */
const LIST_COLUMNS: ReadonlyArray<VistaColumnDef> = [
  { key: "stage", label: "Etapa" },
  { key: "email", label: "Email" },
  { key: "source", label: "Fuente" },
  { key: "tags", label: "Tags" },
  { key: "activity", label: "Última actividad" },
];
const INITIAL_HIDDEN_COLS: ReadonlyArray<string> = ["email"];

export function JobsView({
  jobId,
  stages,
  applications,
  candidatesById,
  tagsByApplicationId,
  workModality,
}: {
  jobId: string;
  stages: PipelineStageRow[];
  applications: ApplicationRow[];
  candidatesById: Record<string, CandidateRow>;
  tagsByApplicationId: Record<string, TagRow[]>;
  workModality: "remote" | "hybrid" | "onsite" | null;
}) {
  const storageKey = `jobs.${jobId}.view`;
  const [view, setView] = useState<View>("kanban");
  const [hydrated, setHydrated] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols, resetCols] = useLocalColumns<string>(
    `jobs.${jobId}.list-cols`,
    INITIAL_HIDDEN_COLS,
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "list" || saved === "kanban") setView(saved);
    setHydrated(true);
  }, [storageKey]);

  function pick(v: View) {
    setView(v);
    try {
      window.localStorage.setItem(storageKey, v);
    } catch {
      /* private mode etc. — ignore */
    }
  }

  // Render kanban during SSR to match the default; swap to localStorage choice
  // only after hydration to avoid flash.
  const effective: View = hydrated ? view : "kanban";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Stage chips drive the list filter. In kanban mode each
            stage is already a column, so the chips would be visual
            noise — hide them until the user switches to list. */}
        {effective === "list" ? (
          <StageChips
            stages={stages}
            applications={applications}
            value={selectedStageId}
            onChange={setSelectedStageId}
          />
        ) : null}
        <div className="ml-auto">
          <VistaPopover
            view={effective}
            onViewChange={pick}
            columns={LIST_COLUMNS}
            hidden={hiddenCols}
            onHiddenChange={setHiddenCols}
            onReset={() => {
              pick("kanban");
              resetCols();
            }}
          />
        </div>
      </div>

      {effective === "kanban" ? (
        <PipelineBoard
          jobId={jobId}
          stages={stages}
          applications={applications}
          candidatesById={candidatesById}
          tagsByApplicationId={tagsByApplicationId}
          workModality={workModality}
        />
      ) : (
        <CandidatesListView
          stages={stages}
          applications={applications}
          candidatesById={candidatesById}
          tagsByApplicationId={tagsByApplicationId}
          selectedStageId={selectedStageId}
          hiddenCols={hiddenCols}
        />
      )}
    </div>
  );
}
