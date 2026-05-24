"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import {
  useLocalColumns,
  useLocalSet,
} from "../../_components/table-controls";
import { PipelineBoard } from "./pipeline-board";
import { CandidatesListView } from "./candidates-list-view";
import { StageChips } from "./_components/stage-chips";
import {
  VistaPopover,
  type VistaColumnDef,
  type VistaFilterDef,
} from "./_components/vista-popover";

const SOURCE_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  referral: "Referido",
  direct: "Directo",
  other: "Otro",
  bulk_import: "Importado Manualmente",
};

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
  // Filters used to be inline chips in the list view; they live in
  // the Vista popover now so the chrome stays focused on stage
  // chips + view toggle. Filter values persist per-job.
  const [sourceFilter, setSourceFilter, resetSourceFilter] = useLocalSet(
    `jobs.${jobId}.filter.source`,
  );
  const [tagFilter, setTagFilter, resetTagFilter] = useLocalSet(
    `jobs.${jobId}.filter.tags`,
  );

  // Derive filter option lists from the dataset, not from a hard-
  // coded enum — only show sources that actually appear in this
  // vacante's applications.
  const sourceOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const a of applications) seen.add(a.source);
    return Array.from(seen).map((s) => ({
      value: s,
      label: SOURCE_LABEL[s] ?? s,
    }));
  }, [applications]);
  const tagOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const id in tagsByApplicationId) {
      for (const t of tagsByApplicationId[id]) m.set(t.id, t.name);
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tagsByApplicationId]);

  const vistaFilters: VistaFilterDef[] = [
    {
      label: "Fuente",
      options: sourceOptions,
      selected: sourceFilter,
      onChange: setSourceFilter,
    },
    {
      label: "Tags",
      options: tagOptions,
      selected: tagFilter,
      onChange: setTagFilter,
    },
  ];

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
            filters={vistaFilters}
            onReset={() => {
              pick("kanban");
              resetCols();
              resetSourceFilter();
              resetTagFilter();
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
          sourceFilter={sourceFilter}
          tagFilter={tagFilter}
          hiddenCols={hiddenCols}
        />
      )}
    </div>
  );
}
