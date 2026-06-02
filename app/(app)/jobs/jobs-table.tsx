"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  type CompanyRow,
  type JobRow,
  type JobStatusRow,
} from "@/lib/hiring";
import { NotificationDot } from "@/components/ui/notification-dot";
import {
  ColumnVisibilityMenu,
  DataTable,
  FilterSection,
  FiltersPopover,
  formatRelative,
  SortHeader,
  TableFilterBar,
  TableSearchFinder,
  useLocalColumnOrder,
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
import { InlineSelectCell } from "../_components/inline-select-cell";
import { useT } from "@/lib/i18n/client";

type SortKey = "title" | "client" | "status" | "candidates" | "created";
type ColKey = "client" | "status" | "candidates" | "created";

type JobRowWithStatus = JobRow & { status: JobStatusRow | null };

export function JobsTable({
  jobs,
  jobStatuses,
  companiesById,
  candidateCounts,
  pendingCounts,
  customFields,
  workspaceSlug,
}: {
  jobs: JobRowWithStatus[];
  /** Workspace's full status list — drives the Estado filter and the
   *  in-row inline JobStatusSelect dropdown. */
  jobStatuses: JobStatusRow[];
  companiesById: Record<string, CompanyRow>;
  candidateCounts: Record<string, number>;
  /** Unreviewed careers applications per job. Drives the red-dot
   *  badge next to the title; zero values skip the badge entirely. */
  pendingCounts: Record<string, number>;
  /**
   * Workspace custom field definitions + per-job values. The table
   * adds a <FilterSection> for every definition flagged
   * `is_filterable` (select/multi_select for options-style filtering,
   * boolean for sí/no/todos) and a toggleable column for every one
   * flagged `is_visible_in_columns`.
   */
  customFields: {
    definitions: Array<{
      id: string;
      key: string;
      label: string;
      kind: string;
      options: unknown;
      is_filterable: boolean;
      is_visible_in_columns: boolean;
    }>;
    valuesByEntityId: Record<string, Record<string, unknown>>;
  };
  /** Current workspace slug — used to build the public posting URL
   *  for the small ↗ shortcut shown next to publicly-visible jobs. */
  workspaceSlug: string;
}) {
  const t = useT();
  const COLUMNS: ReadonlyArray<{ key: ColKey; label: string; locked?: boolean }> =
    [
      { key: "client", label: t("jobsList.colClient") },
      { key: "status", label: t("jobsList.colStatus") },
      { key: "candidates", label: t("jobsList.colCandidates") },
      { key: "created", label: t("jobsList.colCreated") },
    ];
  // Default Estado filter shows only is_open rows — recruiters almost
  // always work the open pipeline first. Resolved against the
  // workspace's actual status list so a renamed/customized status
  // still seeds correctly.
  const defaultOpenStatusIds = useMemo(
    () => jobStatuses.filter((s) => s.is_open).map((s) => s.id),
    [jobStatuses],
  );
  const [statusFilter, setStatusFilter, resetStatusFilter] = useLocalSet(
    "jobs.filter.status",
    defaultOpenStatusIds,
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
  const DEFAULT_ORDER: ColKey[] = useMemo(
    () => ["client", "status", "candidates", "created"],
    [],
  );
  const [orderedKeys, setOrderedKeys, resetOrder] = useLocalColumnOrder<ColKey>(
    "jobs.cols",
    DEFAULT_ORDER,
  );
  const visibleOrdered = useMemo(
    () => orderedKeys.filter((k) => !hiddenCols.has(k)),
    [orderedKeys, hiddenCols],
  );
  // Visibility state for custom-field columns. Stored separately
  // from the built-in cols because the key space is dynamic (def
  // ids, not a known ColKey union). Initial value is empty — every
  // is_visible_in_columns custom field is shown by default; the
  // recruiter hides them explicitly.
  const [hiddenCustomCols, setHiddenCustomCols] = useState<Set<string>>(
    new Set(),
  );

  // Custom-field filters. One Set per definition id; in-memory only
  // (matches the existing transient-filter convention) since custom
  // fields can churn and we don't want stale def-ids hanging in
  // localStorage. Cleared by `resetFilters` below.
  const [customFilters, setCustomFilters] = useState<
    Record<string, Set<string>>
  >({});

  // Slice the definitions into the two flag buckets once.
  const filterableDefs = useMemo(
    () => customFields.definitions.filter((d) => d.is_filterable),
    [customFields.definitions],
  );
  const columnDefs = useMemo(
    () => customFields.definitions.filter((d) => d.is_visible_in_columns),
    [customFields.definitions],
  );
  const activeCustomFilterCount = useMemo(
    () =>
      Object.values(customFilters).reduce(
        (acc, set) => acc + (set?.size ?? 0),
        0,
      ),
    [customFilters],
  );

  function resetFilters() {
    resetStatusFilter();
    resetClientFilter();
    setCustomFilters({});
  }
  // Render only the custom-field columns the user hasn't hidden.
  const visibleColumnDefs = useMemo(
    () => columnDefs.filter((d) => !hiddenCustomCols.has(d.id)),
    [columnDefs, hiddenCustomCols],
  );
  const visibleColCount =
    1 + // title (locked)
    visibleOrdered.length +
    visibleColumnDefs.length +
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
            [company?.name, j.status?.label]
              .filter(Boolean)
              .join(" · ") || undefined,
          href: `/jobs/${j.id}`,
        };
      }),
    [searchMatches, companiesById],
  );

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (statusFilter.size > 0 && !statusFilter.has(j.status_id))
        return false;
      if (clientFilter.size > 0) {
        if (!j.company_id || !clientFilter.has(j.company_id)) return false;
      }
      // Custom-field filters: every def with a non-empty selected Set
      // narrows the row set. Selecting all options of a field is the
      // same as selecting none (no filter applied).
      for (const def of filterableDefs) {
        const sel = customFilters[def.id];
        if (!sel || sel.size === 0) continue;
        const value = customFields.valuesByEntityId[j.id]?.[def.id];
        if (def.kind === "boolean") {
          // Stored as actual bool; serialise to "true"/"false" for the
          // selection Set so the same FilterSection UI works for it.
          const v = value === true ? "true" : value === false ? "false" : "";
          if (!sel.has(v)) return false;
        } else if (Array.isArray(value)) {
          // multi_select: row passes if ANY of its values is selected.
          const hit = value.some((x) => sel.has(String(x)));
          if (!hit) return false;
        } else {
          if (!sel.has(String(value ?? ""))) return false;
        }
      }
      return true;
    });
  }, [
    jobs,
    statusFilter,
    clientFilter,
    customFilters,
    filterableDefs,
    customFields.valuesByEntityId,
  ]);

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
        cmp = (a.status?.position ?? 0) - (b.status?.position ?? 0);
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
          placeholder={t("jobsList.searchPlaceholder")}
          emptyLabel={t("jobsList.searchEmpty")}
          recent={recentSearches}
          onRecordSearch={recordSearch}
          onClearHistory={clearSearchHistory}
        />
        <FiltersPopover
          activeCount={
            statusFilter.size + clientFilter.size + activeCustomFilterCount
          }
          onReset={resetFilters}
        >
          <FilterSection
            label={t("jobsList.filterStatus")}
            options={jobStatuses.map((s) => ({
              value: s.id,
              label: s.label,
            }))}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
          <FilterSection
            label={t("jobsList.filterCompany")}
            options={allClients.map((c) => ({ value: c.id, label: c.name }))}
            selected={clientFilter}
            onChange={setClientFilter}
          />
          {/* One <FilterSection> per workspace custom field flagged
              `is_filterable`. Booleans get a Sí/No pair (rows whose
              value is null are excluded when either is picked).
              Select/multi_select pull options from the definition. */}
          {filterableDefs.map((def) => {
            const setForDef =
              customFilters[def.id] ?? new Set<string>();
            const options =
              def.kind === "boolean"
                ? [
                    { value: "true", label: t("jobsList.yes") },
                    { value: "false", label: t("jobsList.no") },
                  ]
                : Array.isArray(def.options)
                  ? (def.options as string[]).map((o) => ({
                      value: o,
                      label: o,
                    }))
                  : [];
            if (options.length === 0) return null;
            return (
              <FilterSection
                key={def.id}
                label={def.label}
                options={options}
                selected={setForDef}
                onChange={(nextOrUpdater) => {
                  setCustomFilters((prev) => {
                    const prevSet = prev[def.id] ?? new Set<string>();
                    const next =
                      typeof nextOrUpdater === "function"
                        ? (nextOrUpdater as (s: Set<string>) => Set<string>)(
                            prevSet,
                          )
                        : nextOrUpdater;
                    return { ...prev, [def.id]: next };
                  });
                }}
              />
            );
          })}
        </FiltersPopover>
        <ColumnVisibilityMenu
          columns={COLUMNS}
          hidden={hiddenCols}
          onChange={setHiddenCols}
          orderedKeys={orderedKeys}
          onReorder={setOrderedKeys}
          extraColumns={columnDefs.map((d) => ({ id: d.id, label: d.label }))}
          hiddenCustom={hiddenCustomCols}
          onChangeCustom={setHiddenCustomCols}
          onReset={() => {
            resetCols();
            resetOrder();
            setHiddenCustomCols(new Set());
          }}
        />
      </TableFilterBar>

      <DataTable
        colSpan={visibleColCount}
        isEmpty={sorted.length === 0}
        emptyMessage={t("jobsList.tableEmpty")}
        head={
          <>
            <SortHeader
              label={t("jobsList.colJob")}
              k="title"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            {visibleOrdered.map((k) => {
              switch (k) {
                case "client":
                  return (
                    <SortHeader
                      key={k}
                      label={t("jobsList.colClient")}
                      k="client"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                case "status":
                  return (
                    <SortHeader
                      key={k}
                      label={t("jobsList.colStatus")}
                      k="status"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                case "candidates":
                  return (
                    <SortHeader
                      key={k}
                      label={t("jobsList.colCandidates")}
                      k="candidates"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                case "created":
                  return (
                    <SortHeader
                      key={k}
                      label={t("jobsList.colCreated")}
                      k="created"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
              }
            })}
            {/* Custom-field columns (definitions flagged
                `is_visible_in_columns`). Not sortable for now —
                sorting would require typed comparators per kind. */}
            {visibleColumnDefs.map((def) => (
              <th
                key={def.id}
                className="px-4 py-3 font-medium"
                title={def.label}
              >
                {def.label}
              </th>
            ))}
            <th className="w-10 px-4 py-3" aria-label={t("jobsList.actions")} />
          </>
        }
      >
        {sorted.map((j) => {
          const company = j.company_id ? companiesById[j.company_id] : null;
          const appCount = candidateCounts[j.id] ?? 0;
          return (
            <tr key={j.id}>
              <td className="px-4 py-3 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <Link
                    href={`/jobs/${j.id}`}
                    className="hover:underline"
                    onClick={() => {
                      // Stash the currently-rendered (filter+sort) id
                      // list so the opened job header can offer
                      // prev/next + ← / → keyboard nav over exactly
                      // what the user was looking at. Mirrors the
                      // candidate flow's CANDIDATE_NAV_KEY pattern.
                      try {
                        sessionStorage.setItem(
                          "talental:jobNav",
                          JSON.stringify({
                            ids: sorted.map((r) => r.id),
                            origin: "/jobs",
                          }),
                        );
                      } catch {
                        /* sessionStorage unavailable — nav hides */
                      }
                    }}
                  >
                    {j.title || t("jobsList.untitledJob")}
                  </Link>
                  <NotificationDot count={pendingCounts[j.id] ?? 0} />
                  {/* ↗ to the public posting when it's actually live.
                      Same gate as the careers RPCs (is_open AND
                      publication_status != draft). Icon-only so it
                      stays out of the way of the title text. */}
                  {j.status?.is_open === true &&
                  j.publication_status !== "draft" ? (
                    <a
                      href={`/careers/${workspaceSlug}/${j.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("jobsList.viewPublicPosting")}
                      title={t("jobsList.viewPublicPosting")}
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </span>
              </td>
              {visibleOrdered.map((k) => {
                switch (k) {
                  case "client":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 text-muted-foreground"
                      >
                        {company ? (
                          <Link
                            href={`?company=${company.id}`}
                            scroll={false}
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
                    );
                  case "status":
                    return (
                      <td key={k} className="px-4 py-3">
                        <JobStatusSelect
                          jobId={j.id}
                          jobTitle={j.title || undefined}
                          currentStatusId={j.status_id}
                          statuses={jobStatuses}
                        />
                      </td>
                    );
                  case "candidates":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 tabular-nums text-muted-foreground"
                      >
                        {appCount}
                      </td>
                    );
                  case "created":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 font-mono text-xs text-muted-foreground"
                      >
                        {formatRelative(
                          (j.open_date
                            ? `${j.open_date}T00:00:00Z`
                            : null) ??
                            j.published_at ??
                            j.created_at,
                          t,
                        )}
                      </td>
                    );
                }
              })}
              {/* Custom-field cells — display-only formatting per
                  kind. Empty values render an em-dash. */}
              {visibleColumnDefs.map((def) => {
                const v = customFields.valuesByEntityId[j.id]?.[def.id];
                // Select-type custom fields become inline editors in
                // the cell — recruiters can change the value without
                // opening the vacante. Other kinds remain display-only.
                const cell =
                  def.kind === "select" ? (
                    <span onClick={(e) => e.stopPropagation()}>
                      <InlineSelectCell
                        definitionId={def.id}
                        entityId={j.id}
                        initialValue={typeof v === "string" ? v : ""}
                        options={
                          Array.isArray(def.options)
                            ? (def.options as string[])
                            : []
                        }
                      />
                    </span>
                  ) : (
                    formatCustomFieldValue(def, v, t)
                  );
                return (
                  <td
                    key={def.id}
                    className="px-4 py-3 text-xs text-muted-foreground"
                  >
                    {cell}
                  </td>
                );
              })}
              <td className="px-2 py-3 text-right">
                <JobRowActions
                  jobId={j.id}
                  title={j.title || t("jobsList.untitledJob")}
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

/**
 * Render a custom-field value as table-cell text. Kept intentionally
 * minimal — the list view just needs scannable display strings;
 * richer edit affordances live on the entity's slideover / settings.
 */
function formatCustomFieldValue(
  def: { kind: string },
  value: unknown,
  t: ReturnType<typeof useT>,
): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  switch (def.kind) {
    case "boolean":
      return value === true
        ? t("jobsList.yes")
        : value === false
          ? t("jobsList.no")
          : "—";
    case "multi_select":
      return Array.isArray(value) ? value.join(", ") || "—" : "—";
    case "date":
      return typeof value === "string" ? value : "—";
    case "number":
      return typeof value === "number" ? value.toLocaleString("es-MX") : "—";
    case "url": {
      // URL columns render as a compact "Abrir" button instead of the
      // raw URL string — the full URL is usually long enough to blow
      // out the column and isn't useful at a glance anyway. `stopPropagation`
      // so clicking the button doesn't also fire the row's onClick
      // (which would navigate into the vacante).
      const href = typeof value === "string" ? value : "";
      if (!href) return "—";
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded border border-border bg-bg-1 px-2 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent-soft"
          title={href}
        >
          {t("jobsList.open")} ↗
        </a>
      );
    }
    case "email":
    case "text":
    case "long_text":
    case "select":
    default:
      return String(value);
  }
}
