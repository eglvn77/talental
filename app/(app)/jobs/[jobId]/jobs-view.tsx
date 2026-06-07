"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
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

function sourceLabels(t: TFunction): Record<string, string> {
  return {
    linkedin: "LinkedIn",
    indeed: "Indeed",
    referral: t("jobDetail.sourceReferral"),
    direct: t("jobDetail.sourceDirect"),
    other: t("jobDetail.sourceOther"),
    bulk_import: t("jobDetail.sourceBulkImport"),
  };
}

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
function listColumns(t: TFunction): ReadonlyArray<VistaColumnDef> {
  return [
    { key: "stage", label: t("jobDetail.colStage") },
    { key: "company", label: t("jobDetail.colCompany") },
    { key: "email", label: t("jobDetail.colEmail") },
    { key: "source", label: t("jobDetail.colSource") },
    { key: "tags", label: t("jobDetail.colTags") },
    { key: "activity", label: t("jobDetail.colActivity") },
  ];
}
// Email starts hidden (the name column used to inline it); company
// stays default-visible. Position was dropped — puestos free-text de
// Coresignal son demasiado variados para ser un filtro/columna útil.
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
  const t = useT();
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
  const [companyFilter, setCompanyFilter, resetCompanyFilter] = useLocalSet(
    `jobs.${jobId}.filter.company`,
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
    const labels = sourceLabels(t);
    const seen = new Set<string>();
    for (const a of applications) seen.add(a.source);
    return Array.from(seen).map((s) => ({
      value: s,
      label: labels[s] ?? s,
    }));
  }, [applications, t]);
  const tagOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const id in tagsByApplicationId) {
      for (const tag of tagsByApplicationId[id]) m.set(tag.id, tag.name);
    }
    return Array.from(m.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tagsByApplicationId]);

  // Company option list derived from the candidates on this vacante.
  // Empty/blank values collapse — only distinct populated strings get
  // filter chips. Position was removed (free-text demasiado variado).
  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of applications) {
      const c = candidatesById[a.candidate_id];
      const co = c?.current_company_name?.trim();
      if (co) set.add(co);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [applications, candidatesById]);

  function resetFilters() {
    resetSourceFilter();
    resetTagFilter();
    resetCompanyFilter();
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
        activeCount={
          sourceFilter.size +
          tagFilter.size +
          companyFilter.size
        }
        onReset={resetFilters}
      >
        {companyOptions.length > 0 ? (
          <FilterSection
            label={t("jobDetail.colCompany")}
            options={companyOptions}
            selected={companyFilter}
            onChange={setCompanyFilter}
          />
        ) : null}
        <FilterSection
          label={t("jobDetail.colSource")}
          options={sourceOptions}
          selected={sourceFilter}
          onChange={setSourceFilter}
        />
        <FilterSection
          label={t("jobDetail.colTags")}
          options={tagOptions}
          selected={tagFilter}
          onChange={setTagFilter}
        />
      </FiltersPopover>
      <VistaPopover
        view={effective}
        onViewChange={pick}
        columns={listColumns(t)}
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
    // flex-1 min-h-0 makes this view fill the job-layout content slot
    // and lets the kanban / list inside shrink-to-fit + scroll
    // internally. gap-3 replaces space-y-3 so children behave well in
    // the flex flow.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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
          companyFilter={companyFilter}
          hiddenCols={hiddenCols}
        />
      )}
    </div>
  );
}
