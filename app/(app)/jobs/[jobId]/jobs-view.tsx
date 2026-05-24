"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  type ApplicationRow,
  type CandidateRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import {
  FilterSection,
  FiltersPopover,
  useLocalColumns,
  useLocalSet,
  useSearchHistory,
} from "../../_components/table-controls";
import { PipelineBoard } from "./pipeline-board";
import { CandidatesListView } from "./candidates-list-view";
import { StageChips } from "./_components/stage-chips";
import { CandidateSearch } from "./_components/candidate-search";
import {
  VistaPopover,
  type VistaColumnDef,
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
  // Free-text search across candidate name + email + linkedin.
  // Drives the CandidateSearch results dropdown — does NOT filter
  // the kanban or list views (the search is a finder, not a filter).
  // In-memory only — the input clears when the user navigates away
  // from this vacante. Recent searches persist separately so the
  // user can re-run a previous query on return.
  const [searchQuery, setSearchQuery] = useState("");
  const {
    recent: recentSearches,
    record: recordSearch,
    clear: clearSearchHistory,
  } = useSearchHistory(`jobs.${jobId}.candidates`);

  // Stage lookup for the search results — annotates each match with
  // its current stage pill.
  const stagesById = useMemo(() => {
    const m: Record<string, (typeof stages)[number]> = {};
    for (const s of stages) m[s.id] = s;
    return m;
  }, [stages]);

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

  function resetFilters() {
    resetSourceFilter();
    resetTagFilter();
  }

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

  // Filtros + Vista live up in the tabs row via React Portal. The
  // layout renders an empty `#job-tab-actions` slot pinned right;
  // we mount our controls into it once the DOM exists. Falling
  // back to inline rendering would compete with the stage chips for
  // horizontal space — pinning them to the tabs row keeps the
  // bottom row (chips) clean and the actions always visible.
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setActionsSlot(document.getElementById("job-tab-actions"));
  }, []);
  const tabActions = (
    <>
      <CandidateSearch
        value={searchQuery}
        onChange={setSearchQuery}
        applications={applications}
        candidatesById={candidatesById}
        stagesById={stagesById}
        recent={recentSearches}
        onRecordSearch={recordSearch}
        onClearHistory={clearSearchHistory}
      />
      <FiltersPopover
        activeCount={sourceFilter.size + tagFilter.size}
        onReset={resetFilters}
      >
        <FilterSection
          label="Fuente"
          options={sourceOptions}
          selected={sourceFilter}
          onChange={setSourceFilter}
        />
        <FilterSection
          label="Tags"
          options={tagOptions}
          selected={tagFilter}
          onChange={setTagFilter}
        />
      </FiltersPopover>
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
    </>
  );

  return (
    <div className="space-y-3">
      {actionsSlot ? createPortal(tabActions, actionsSlot) : null}
      {/* Stage chips drive the list filter. Only shown in list mode
          since kanban already has a column per stage — surfacing the
          chips there would be redundant. */}
      {effective === "list" ? (
        <StageChips
          stages={stages}
          applications={applications}
          value={selectedStageId}
          onChange={setSelectedStageId}
        />
      ) : null}

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
