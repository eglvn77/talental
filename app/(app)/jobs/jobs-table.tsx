"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { type CompanyRow, type JobRow } from "@/lib/hiring";
import { JOB_STATUS_LABEL, JOB_STATUS_VALUES } from "@/lib/job-status";
import {
  ColumnVisibilityMenu,
  DataTable,
  FilterSection,
  FiltersPopover,
  formatRelative,
  SortHeader,
  TableFilterBar,
  TableSearchFinder,
  useLocalColumns,
  useLocalSet,
  useLocalSort,
  useSearchHistory,
  useTextFilter,
  type FinderResult,
} from "../_components/table-controls";
import { JobStatusSelect } from "./status-select";
import { JobRowActions } from "./job-row-actions";
import { CompanyLogo } from "@/components/company-logo";

type SortKey = "title" | "client" | "status" | "candidates" | "created";
type ColKey = "client" | "status" | "candidates" | "created";

const COLUMNS: ReadonlyArray<{ key: ColKey; label: string; locked?: boolean }> = [
  { key: "client", label: "Empresa" },
  { key: "status", label: "Estado" },
  { key: "candidates", label: "Candidatos" },
  { key: "created", label: "Creada" },
];

export function JobsTable({
  jobs,
  companiesById,
  candidateCounts,
}: {
  jobs: JobRow[];
  companiesById: Record<string, CompanyRow>;
  candidateCounts: Record<string, number>;
}) {
  // Default Estado filter shows only "activa" — recruiters almost
  // always work the open pipeline first.
  const [statusFilter, setStatusFilter, resetStatusFilter] = useLocalSet(
    "jobs.filter.status",
    ["activa"],
  );
  const [clientFilter, setClientFilter, resetClientFilter] = useLocalSet(
    "jobs.filter.client",
  );
  // In-memory query (clears on navigation); history is persisted.
  const [query, setQuery] = useState("");
  const {
    recent: recentSearches,
    record: recordSearch,
    clear: clearSearchHistory,
  } = useSearchHistory("jobs");
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "jobs.sort",
    { key: "created", dir: "desc" },
    ["title", "client", "status"],
  );
  const [hiddenCols, setHiddenCols, resetCols] =
    useLocalColumns<ColKey>("jobs.cols");
  function resetFilters() {
    resetStatusFilter();
    resetClientFilter();
  }
  const showClient = !hiddenCols.has("client");
  const showStatus = !hiddenCols.has("status");
  const showCandidates = !hiddenCols.has("candidates");
  const showCreated = !hiddenCols.has("created");
  const visibleColCount =
    1 + // title (locked)
    (showClient ? 1 : 0) +
    (showStatus ? 1 : 0) +
    (showCandidates ? 1 : 0) +
    (showCreated ? 1 : 0) +
    1; // actions

  const allClients = useMemo(() => {
    const m = new Map<string, CompanyRow>();
    for (const j of jobs) {
      if (j.company_id) {
        const c = companiesById[j.company_id];
        if (c) m.set(c.id, c);
      }
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs, companiesById]);

  // Show ALL valid status values, not just those in use, so the user can
  // pre-select a filter even when no rows match yet.
  const allStatuses = JOB_STATUS_VALUES;

  // Finder results: search jumps to a job; doesn't filter the table.
  const searchMatches = useTextFilter(jobs, query, (j) => [
    j.title,
    j.company_id ? companiesById[j.company_id]?.name : null,
  ]);
  const searchResults: FinderResult[] = useMemo(
    () =>
      searchMatches.slice(0, 12).map((j) => {
        const company = j.company_id ? companiesById[j.company_id] : null;
        return {
          id: j.id,
          title: j.title,
          subtitle:
            [
              company?.name,
              JOB_STATUS_LABEL[j.status as keyof typeof JOB_STATUS_LABEL] ??
                j.status,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
          href: `/jobs/${j.id}`,
        };
      }),
    [searchMatches, companiesById],
  );

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (statusFilter.size > 0 && !statusFilter.has(j.status)) return false;
      if (clientFilter.size > 0) {
        if (!j.company_id || !clientFilter.has(j.company_id)) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, clientFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sort.key === "client") {
        const an = a.company_id ? companiesById[a.company_id]?.name ?? "" : "";
        const bn = b.company_id ? companiesById[b.company_id]?.name ?? "" : "";
        cmp = an.localeCompare(bn);
      } else if (sort.key === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sort.key === "candidates") {
        cmp =
          (candidateCounts[a.id] ?? 0) - (candidateCounts[b.id] ?? 0);
      } else {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort, companiesById, candidateCounts]);

  return (
    <div className="space-y-3">
      <TableFilterBar shown={sorted.length} total={jobs.length}>
        <TableSearchFinder
          value={query}
          onChange={setQuery}
          results={searchResults}
          placeholder="Buscar vacante…"
          emptyLabel="Sin vacantes que coincidan."
          recent={recentSearches}
          onRecordSearch={recordSearch}
          onClearHistory={clearSearchHistory}
        />
        <FiltersPopover
          activeCount={statusFilter.size + clientFilter.size}
          onReset={resetFilters}
        >
          <FilterSection
            label="Estado"
            options={allStatuses.map((s) => ({
              value: s,
              label: JOB_STATUS_LABEL[s as keyof typeof JOB_STATUS_LABEL] ?? s,
            }))}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
          <FilterSection
            label="Empresa"
            options={allClients.map((c) => ({ value: c.id, label: c.name }))}
            selected={clientFilter}
            onChange={setClientFilter}
          />
        </FiltersPopover>
        <ColumnVisibilityMenu
          columns={COLUMNS}
          hidden={hiddenCols}
          onChange={setHiddenCols}
          onReset={resetCols}
        />
      </TableFilterBar>

      <DataTable
        colSpan={visibleColCount}
        isEmpty={sorted.length === 0}
        emptyMessage="No hay vacantes que coincidan con los filtros."
        head={
          <>
            <SortHeader
              label="Vacante"
              k="title"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            {showClient ? (
              <SortHeader
                label="Empresa"
                k="client"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showStatus ? (
              <SortHeader
                label="Estado"
                k="status"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showCandidates ? (
              <SortHeader
                label="Candidatos"
                k="candidates"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showCreated ? (
              <SortHeader
                label="Creada"
                k="created"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            <th className="w-10 px-4 py-3" aria-label="Acciones" />
          </>
        }
      >
        {sorted.map((j) => {
          const company = j.company_id ? companiesById[j.company_id] : null;
          const appCount = candidateCounts[j.id] ?? 0;
          return (
            <tr key={j.id}>
              <td className="px-4 py-3 font-medium">
                <Link href={`/jobs/${j.id}`} className="hover:underline">
                  {j.title}
                </Link>
              </td>
              {showClient ? (
                <td className="px-4 py-3 text-muted-foreground">
                  {company ? (
                    // Link to the company slideover at /companies.
                    // Inline-flex + group so the logo doesn't move on
                    // hover; only the name picks up the underline.
                    <Link
                      href={`/companies?company=${company.id}`}
                      className="group inline-flex items-center gap-2"
                    >
                      <CompanyLogo
                        src={company.logo_url}
                        domain={company.domain}
                        name={company.name}
                        size="sm"
                      />
                      <span className="truncate text-foreground group-hover:underline">
                        {company.name}
                      </span>
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              ) : null}
              {showStatus ? (
                <td className="px-4 py-3">
                  <JobStatusSelect jobId={j.id} current={j.status} />
                </td>
              ) : null}
              {showCandidates ? (
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {appCount}
                </td>
              ) : null}
              {showCreated ? (
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {formatRelative(
                    (j.open_date ? `${j.open_date}T00:00:00Z` : null) ??
                      j.published_at ??
                      j.created_at,
                  )}
                </td>
              ) : null}
              <td className="px-2 py-3 text-right">
                <JobRowActions
                  jobId={j.id}
                  title={j.title}
                  applicationCount={appCount}
                />
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
