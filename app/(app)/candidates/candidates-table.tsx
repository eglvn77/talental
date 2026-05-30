"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, FileText, Linkedin } from "lucide-react";
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
import { bulkDeleteCandidatesAction } from "../actions";
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

type SortKey = "name" | "email" | "source" | "applications" | "created";
type ColKey = "email" | "source" | "applications" | "created";

export function CandidatesTable({
  candidates,
  recentIds,
}: {
  candidates: CandidateListRow[];
  /** Optional: candidates to mark as "Nuevo" (e.g. just after a CV
   *  bulk import). They float to the top of the table and get a pill. */
  recentIds?: string[];
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
    useLocalColumns<ColKey>("candidates.cols");
  const showEmail = !hiddenCols.has("email");
  const showSource = !hiddenCols.has("source");
  const showApplications = !hiddenCols.has("applications");
  const showCreated = !hiddenCols.has("created");
  // +1 for the selection checkbox column at the start.
  const visibleColCount =
    1 + // checkbox
    1 + // name
    (showEmail ? 1 : 0) +
    (showSource ? 1 : 0) +
    (showApplications ? 1 : 0) +
    (showCreated ? 1 : 0) +
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
    });
    return arr;
  }, [filtered, sort]);

  function rowHref(c: CandidateListRow): string {
    // Open the talent-pool slideover via query param (server-side
    // CandidatesPage renders <CandidateProfileSlideover> when set).
    // From inside the slideover the recruiter can drill into a
    // specific application via the "Ver en vacante" link.
    return `?candidate=${c.id}`;
  }

  // Client-side chunking: render 100 rows at a time. Filter/sort run over
  // the full set so search is honest, but the DOM stays small. Reset on
  // filter or sort change so "Cargar más" doesn't appear stale.
  const PAGE = 100;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [sourceFilter, sort]);
  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

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
          columns={columns}
          hidden={hiddenCols}
          onChange={setHiddenCols}
          onReset={resetCols}
        />
      </TableFilterBar>

      <DataTable
        colSpan={visibleColCount}
        isEmpty={sorted.length === 0}
        emptyMessage={t("candidatesArea.noResults")}
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
            {showEmail ? (
              <SortHeader
                label={t("candidatesArea.colEmail")}
                k="email"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showSource ? (
              <SortHeader
                label={t("candidatesArea.colSource")}
                k="source"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showApplications ? (
              <SortHeader
                label={t("candidatesArea.colApplications")}
                k="applications"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showCreated ? (
              <SortHeader
                label={t("candidatesArea.colCreated")}
                k="created"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            <th className="w-8 px-2 py-3" />
          </>
        }
      >
        {visible.map((c) => {
                const href = rowHref(c);
                const recent = c.applications[0];
                const recentJob = recent
                  ? (Array.isArray(recent.job) ? recent.job[0] : recent.job)
                  : null;
                return (
                  <tr
                    key={c.id}
                    onClick={() => {
                      if (href) router.push(href, { scroll: false });
                    }}
                    className={cn(
                      "transition-colors",
                      href ? "cursor-pointer hover:bg-muted/40" : "",
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
                    {showEmail ? (
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.email ?? "—"}
                      </td>
                    ) : null}
                    {showSource ? (
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.default_source
                          ? sourceLabel(t, c.default_source)
                          : "—"}
                      </td>
                    ) : null}
                    {showApplications ? (
                      <td className="px-4 py-3">
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
                    ) : null}
                    {showCreated ? (
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {formatRelative(c.created_at, t)}
                      </td>
                    ) : null}
                    <td className="px-2 py-3 text-right">
                      {href ? (
                        <ExternalLink
                          className="ml-auto h-3 w-3 text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
      </DataTable>

      {hasMore ? (
        <div className="flex items-center justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t("candidatesArea.loadMore", {
              count: sorted.length - visibleCount,
            })}
          </button>
        </div>
      ) : null}

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
      />
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
