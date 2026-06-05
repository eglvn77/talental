"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Link as LinkIcon, Linkedin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CandidateSource } from "@/lib/hiring";
import {
  ColumnVisibilityMenu,
  DataTable,
  FilterSection,
  FiltersPopover,
  SortHeader,
  TableFilterBar,
  TableSearchFinder,
  formatRelative,
  useLocalColumnOrder,
  useLocalColumns,
  useLocalSet,
  useLocalSort,
  useSearchHistory,
  useTextFilter,
  type FinderResult,
} from "../_components/table-controls";
import {
  BulkActionsBar,
  SelectionCheckbox,
} from "../_components/bulk-actions-bar";
import { InlineSelectCell } from "../_components/inline-select-cell";
import { normalizeOptions } from "@/lib/custom-fields-options";
import {
  compareCustomFieldValues,
  isSortableKind,
} from "../_components/custom-field-sort";
import { formatCustomFieldValue } from "../_components/format-custom-field-value";
import {
  bulkDeleteCandidatesAction,
  bulkUpdateCandidateSourceAction,
  loadSourcesForScopeAction,
} from "../actions";
import {
  BulkCustomFieldPopover,
  type BulkEditField,
} from "../_components/bulk-custom-field-popover";
import { BulkTagsPopover } from "../_components/bulk-tags-popover";
import { TablePagination } from "../_components/table-pagination";
import { bulkUpdateCustomFieldValueAction } from "../settings/actions";
import { CANDIDATE_NAV_KEY } from "./candidate-screen";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";

export type CandidateListRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
  default_source: CandidateSource | null;
  created_at: string;
  applications: Array<{
    id: string;
    job_id: string;
    applied_at: string | null;
    status_changed_at: string | null;
    job: { id: string; title: string } | { id: string; title: string }[] | null;
  }>;
};

function sourceLabel(t: TFunction, s: CandidateSource): string {
  switch (s) {
    case "linkedin":
      return "LinkedIn";
    case "indeed":
      return "Indeed";
    case "referral":
      return t("candidatesArea.sourceReferral");
    case "direct":
      return t("candidatesArea.sourceDirect");
    case "bulk_import":
      return t("candidatesArea.sourceBulkImport");
    case "other":
      return t("candidatesArea.sourceOther");
  }
}

// Built-in keys + custom-field UUIDs (handled at runtime).
type SortKey =
  | "name"
  | "email"
  | "source"
  | "applications"
  | "created"
  | string;
type ColKey = "email" | "source" | "applications" | "created";

export function CandidatesTable({
  candidates,
  recentIds,
  customFields,
  total,
  serverSort,
  serverDir,
  serverQuery,
  serverSourceIds,
}: {
  candidates: CandidateListRow[];
  /** Optional: candidates to mark as "Nuevo" (e.g. just after a CV
   *  bulk import). They float to the top of the table and get a pill. */
  recentIds?: string[];
  /** Workspace custom-field definitions + per-candidate values. The
   *  table adds a toggleable column for every definition flagged
   *  `is_visible_in_columns`; select-kind cells become inline editors
   *  via <InlineSelectCell>. Mirrors the jobs-table wiring. */
  customFields: {
    definitions: Array<{
      id: string;
      key: string;
      label: string;
      kind: string;
      options: unknown;
      is_visible_in_columns: boolean;
    }>;
    valuesByEntityId: Record<string, Record<string, unknown>>;
  };
  /** Total row count across the filtered dataset (server-side). */
  total: number;
  /** Server-derived sort key + direction so the SortHeader chevrons
   *  reflect the URL state. */
  serverSort: string;
  serverDir: "asc" | "desc";
  /** Initial value for the search input (URL ?q=). */
  serverQuery: string;
  /** Initial value for the source filter Set (URL ?source=csv). */
  serverSourceIds: string[];
}) {
  const recentSet = useMemo(
    () => new Set(recentIds ?? []),
    [recentIds],
  );
  const t = useT();
  const columns = useMemo(
    () => [
      { key: "email" as ColKey, label: t("candidatesArea.colEmail") },
      { key: "source" as ColKey, label: t("candidatesArea.colSource") },
      { key: "applications" as ColKey, label: t("candidatesArea.colApplications") },
      { key: "created" as ColKey, label: t("candidatesArea.colCreated") },
    ],
    [t],
  );
  const router = useRouter();
  // Search query is intentionally in-memory only — it resets when
  // the user navigates away from /candidates. Recent searches are
  // persisted separately via useSearchHistory.
  const [search, setSearch] = useState("");
  const {
    recent: recentSearches,
    record: recordSearch,
    clear: clearSearchHistory,
  } = useSearchHistory("candidates");
  const [sourceFilter, setSourceFilter, resetSourceFilter] = useLocalSet(
    "candidates.source",
  );
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "candidates.sort",
    { key: "created", dir: "desc" },
    ["name", "email", "source"],
  );
  const [hiddenCols, setHiddenCols, resetCols] =
    useLocalColumns<string>("candidates.cols");
  const columnDefs = useMemo(
    () => customFields.definitions.filter((d) => d.is_visible_in_columns),
    [customFields.definitions],
  );
  const BUILTIN_ORDER: ColKey[] = ["email", "source", "applications", "created"];
  const DEFAULT_ORDER = useMemo<string[]>(
    () => [...BUILTIN_ORDER, ...columnDefs.map((d) => d.id)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnDefs],
  );
  const [orderedKeys, setOrderedKeys, resetOrder] = useLocalColumnOrder<string>(
    "candidates.cols",
    DEFAULT_ORDER,
  );
  const visibleOrdered = useMemo(
    () => orderedKeys.filter((k) => !hiddenCols.has(k)),
    [orderedKeys, hiddenCols],
  );
  // +1 for the selection checkbox column at the start.
  const visibleColCount =
    1 + // checkbox
    1 + // name
    visibleOrdered.length +
    1;

  // Row selection — drives the floating <BulkActionsBar>. Set of
  // candidate ids; reset when the underlying filter/sort changes so
  // the selection doesn't carry stale ids the user can't see anymore.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Text search drives the finder dropdown only — it does NOT filter
  // the visible table. Filters live in <FiltersPopover> for "shape
  // the view", search lives in <TableSearchFinder> for "jump to a
  // specific candidate" regardless of what's filtered out.
  const searchMatches = useTextFilter(candidates, search, (c) => [
    c.full_name,
    c.email,
    c.linkedin_url,
    c.phone,
  ]);
  const searchResults: FinderResult[] = useMemo(
    () =>
      searchMatches.slice(0, 12).map((c) => ({
        id: c.id,
        title: c.full_name,
        subtitle: c.email ?? c.linkedin_url ?? c.phone ?? undefined,
        href: `?candidate=${c.id}`,
      })),
    [searchMatches],
  );

  // Source filter (applies to the visible table).
  const filtered = useMemo(() => {
    if (sourceFilter.size === 0) return candidates;
    return candidates.filter((c) =>
      c.default_source ? sourceFilter.has(c.default_source) : false,
    );
  }, [candidates, sourceFilter]);

  // Source filter options.
  const sourceOptions = useMemo(() => {
    const present = new Set<string>();
    for (const c of candidates) {
      if (c.default_source) present.add(c.default_source);
    }
    return Array.from(present)
      .sort()
      .map((s) => ({
        value: s,
        label: sourceLabel(t, s as CandidateSource) ?? s,
      }));
  }, [candidates, t]);

  // Sort.
  const sorted = useMemo(() => {
    const customDef = customFields.definitions.find((d) => d.id === sort.key);
    const arr = filtered.slice();
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.full_name.localeCompare(b.full_name) * dir;
        case "email":
          return (a.email ?? "").localeCompare(b.email ?? "") * dir;
        case "source":
          return (a.default_source ?? "").localeCompare(b.default_source ?? "") *
            dir;
        case "applications":
          return (a.applications.length - b.applications.length) * dir;
        case "created":
          return a.created_at.localeCompare(b.created_at) * dir;
      }
      if (customDef) {
        return (
          compareCustomFieldValues(
            customDef,
            customFields.valuesByEntityId[a.id]?.[customDef.id],
            customFields.valuesByEntityId[b.id]?.[customDef.id],
          ) * dir
        );
      }
      return 0;
    });
    return arr;
  }, [filtered, sort, customFields.definitions, customFields.valuesByEntityId]);

  // Open the profile as a slideover that overlays the table (the route
  // stays /candidates — only ?candidate= changes). Stash the current
  // ordered id-list so the panel header can offer prev/next through
  // exactly what the recruiter is looking at (active filter + sort).
  function openCandidate(currentId: string, ordered: string[]) {
    try {
      sessionStorage.setItem(
        CANDIDATE_NAV_KEY,
        JSON.stringify({ ids: ordered, origin: "/candidates" }),
      );
    } catch {
      /* sessionStorage unavailable (private mode) — nav just hides */
    }
    router.push(`?candidate=${currentId}`, { scroll: false });
  }

  // Server-side paginated: the table renders whatever the server
  // already filtered+sorted+sliced. Client-side filters/search/sort
  // narrow only the visible page; the <TablePagination /> at the
  // bottom moves between pages of the full dataset.
  const visible = sorted;
  const hasMore = false;
  void hasMore;

  return (
    <div className="space-y-3">
      <TableFilterBar shown={sorted.length} total={candidates.length}>
        <TableSearchFinder
          value={search}
          onChange={setSearch}
          results={searchResults}
          placeholder={t("candidatesArea.searchPlaceholder")}
          emptyLabel={t("candidatesArea.searchEmpty")}
          recent={recentSearches}
          onRecordSearch={recordSearch}
          onClearHistory={clearSearchHistory}
        />
        <FiltersPopover
          activeCount={sourceFilter.size}
          onReset={resetSourceFilter}
        >
          <FilterSection
            label={t("candidatesArea.colSource")}
            options={sourceOptions}
            selected={sourceFilter}
            onChange={setSourceFilter}
          />
        </FiltersPopover>
        <ColumnVisibilityMenu
          columns={[
            ...columns,
            ...columnDefs.map((d) => ({ key: d.id, label: d.label })),
          ]}
          hidden={hiddenCols}
          onChange={setHiddenCols}
          orderedKeys={orderedKeys}
          onReorder={setOrderedKeys}
          onReset={() => {
            resetCols();
            resetOrder();
          }}
        />
      </TableFilterBar>

      <DataTable
        colSpan={visibleColCount}
        isEmpty={sorted.length === 0}
        emptyMessage={t("candidatesArea.noResults")}
        stickyColumns={2}
        head={
          <>
            <th className="w-10 px-3 py-3">
              <SelectionCheckbox
                checked={
                  visible.length > 0 &&
                  visible.every((c) => selected.has(c.id))
                }
                onChange={(next) => {
                  setSelected((prev) => {
                    const out = new Set(prev);
                    if (next) {
                      for (const c of visible) out.add(c.id);
                    } else {
                      for (const c of visible) out.delete(c.id);
                    }
                    return out;
                  });
                }}
                ariaLabel={t("candidatesArea.selectAllVisible")}
              />
            </th>
            <SortHeader
              label={t("candidatesArea.colName")}
              k="name"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            {visibleOrdered.map((k) => {
              switch (k) {
                case "email":
                  return (
                    <SortHeader
                      key={k}
                      label={t("candidatesArea.colEmail")}
                      k="email"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                case "source":
                  return (
                    <SortHeader
                      key={k}
                      label={t("candidatesArea.colSource")}
                      k="source"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                case "applications":
                  return (
                    <SortHeader
                      key={k}
                      label={t("candidatesArea.colApplications")}
                      k="applications"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                case "created":
                  return (
                    <SortHeader
                      key={k}
                      label={t("candidatesArea.colCreated")}
                      k="created"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
              }
              // Custom-field column dispatched off the def id.
              const def = columnDefs.find((d) => d.id === k);
              if (!def) return null;
              return isSortableKind(def.kind) ? (
                <SortHeader
                  key={def.id}
                  label={def.label}
                  k={def.id}
                  state={sort}
                  onToggle={toggleSort}
                  className="px-4 py-3 font-medium"
                />
              ) : (
                <th
                  key={def.id}
                  className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {def.label}
                </th>
              );
            })}
            <th className="w-8 px-2 py-3" />
          </>
        }
      >
        {visible.map((c) => {
                const recent = c.applications[0];
                const recentJob = recent
                  ? (Array.isArray(recent.job) ? recent.job[0] : recent.job)
                  : null;
                return (
                  <tr
                    key={c.id}
                    onClick={() =>
                      openCandidate(c.id, sorted.map((r) => r.id))
                    }
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/40",
                      selected.has(c.id) ? "bg-accent/5" : "",
                    )}
                  >
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SelectionCheckbox
                        checked={selected.has(c.id)}
                        onChange={(next) => {
                          setSelected((prev) => {
                            const out = new Set(prev);
                            if (next) out.add(c.id);
                            else out.delete(c.id);
                            return out;
                          });
                        }}
                        ariaLabel={t("candidatesArea.selectOne", { name: c.full_name })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium"
                          aria-hidden
                        >
                          {initials(c.full_name)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">
                              {c.full_name}
                            </span>
                            {recentSet.has(c.id) ? (
                              <span className="shrink-0 rounded bg-positive-soft px-1 py-px text-[9px] font-medium uppercase tracking-wide text-positive">
                                {t("candidatesArea.newPill")}
                              </span>
                            ) : null}
                          </div>
                          {c.linkedin_url ? (
                            <a
                              href={c.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              <Linkedin className="h-3 w-3" />
                              LinkedIn
                            </a>
                          ) : null}
                        </div>
                        {c.resume_url ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                            title={t("candidatesArea.hasCv")}
                          >
                            <FileText className="h-3 w-3" />
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {visibleOrdered.map((k) => {
                      switch (k) {
                        case "email":
                          return (
                            <td
                              key={k}
                              className="px-4 py-3 text-muted-foreground"
                            >
                              {c.email ?? "—"}
                            </td>
                          );
                        case "source":
                          return (
                            <td
                              key={k}
                              className="px-4 py-3 text-muted-foreground"
                            >
                              {c.default_source
                                ? sourceLabel(t, c.default_source)
                                : "—"}
                            </td>
                          );
                        case "applications":
                          return (
                            <td key={k} className="px-4 py-3">
                              {c.applications.length === 0 ? (
                                <span className="text-xs text-muted-foreground">
                                  {t("candidatesArea.noApplications")}
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                                    {c.applications.length}
                                  </span>
                                  {recentJob ? (
                                    <Link
                                      href={`/jobs/${recentJob.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="truncate text-muted-foreground hover:text-foreground"
                                    >
                                      {recentJob.title}
                                    </Link>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          );
                        case "created":
                          return (
                            <td
                              key={k}
                              className="px-4 py-3 font-mono text-xs text-muted-foreground"
                            >
                              {formatRelative(c.created_at, t)}
                            </td>
                          );
                      }
                      const def = columnDefs.find((d) => d.id === k);
                      if (!def) return null;
                      const v = customFields.valuesByEntityId[c.id]?.[def.id];
                      const cell =
                        def.kind === "select" ? (
                          <span onClick={(e) => e.stopPropagation()}>
                            <InlineSelectCell
                              definitionId={def.id}
                              entityId={c.id}
                              initialValue={typeof v === "string" ? v : ""}
                              options={normalizeOptions(def.options)}
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
                      <LinkIcon
                        className="ml-auto h-3 w-3 text-muted-foreground"
                        aria-hidden
                      />
                    </td>
                  </tr>
                );
              })}
      </DataTable>

      <TablePagination total={total} />

      <BulkActionsBar
        selectedCount={selected.size}
        onClear={() => setSelected(new Set())}
        entityLabel={t("candidatesArea.entityCandidate")}
        onDelete={async () => {
          const ids = [...selected];
          const res = await bulkDeleteCandidatesAction(ids);
          if (!res.ok) {
            toast.actionFailed(t("candidatesArea.deleteFailed"), res.error);
            return;
          }
          toast.actionOk(
            res.data.deleted === 1
              ? t("candidatesArea.deletedOne", { count: res.data.deleted })
              : t("candidatesArea.deletedMany", { count: res.data.deleted }),
          );
          router.refresh();
        }}
      >
        <BulkCustomFieldPopover
          selectedIds={selected}
          fields={[
            // Built-in: Source/Origen. Loads workspace sources the
            // first time the user picks the field. Stored value is
            // the source.id; UI label is source.label.
            {
              id: "builtin:source_id",
              label: t("candidatesArea.colSource"),
              kind: "select",
              loadOptions: async () => {
                const res = await loadSourcesForScopeAction("candidate");
                if (!res.ok) return [];
                return res.data.map((s) => ({
                  value: s.id,
                  label: s.label,
                  color: s.color,
                }));
              },
              apply: (ids, value) =>
                bulkUpdateCandidateSourceAction(
                  ids,
                  value === null ? null : String(value),
                ),
            },
            // Workspace custom fields (whatever the workspace has
            // configured for candidate entity).
            ...customFields.definitions.map(
              (d): BulkEditField => ({
                id: `custom:${d.id}`,
                label: d.label,
                kind: d.kind as BulkEditField["kind"],
                options: normalizeOptions(d.options).map((o) => ({
                  value: o.value,
                  color: o.color,
                })),
                apply: (ids, value) =>
                  bulkUpdateCustomFieldValueAction({
                    definitionId: d.id,
                    entityIds: ids,
                    value,
                  }),
              }),
            ),
          ]}
          onDone={() => {
            setSelected(new Set());
            router.refresh();
          }}
        />
        <BulkTagsPopover
          entityType="candidate"
          selectedIds={selected}
          onDone={() => {
            setSelected(new Set());
            router.refresh();
          }}
        />
      </BulkActionsBar>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
