"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type CompanyRow, type CompanyStatus } from "@/lib/hiring";
import { bulkDeleteCompaniesAction, updateCompanyStatusAction } from "../actions";
import { toast } from "@/lib/toast";
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
  ColumnVisibilityMenu,
  DataTable,
  FilterSection,
  FiltersPopover,
  formatRelative,
  SortHeader,
  TableFilterBar,
  TableSearchFinder,
  type FinderResult,
  useLocalColumnOrder,
  useLocalColumns,
  useLocalSet,
  useLocalSort,
  useSearchHistory,
  useTextFilter,
} from "../_components/table-controls";
import { CompanyLogo } from "@/components/company-logo";
import { type CompanyStatusDisplay } from "@/lib/company-status";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";

/** Safe key→display lookup (client-side; the server helper can't be
 *  imported here). Falls back to the stone color for unknown keys. */
function displayFor(
  map: Record<string, CompanyStatusDisplay>,
  key: string,
): CompanyStatusDisplay {
  return map[key] ?? { label: key, color: "#94a3b8" };
}

type SortKey = "name" | "domain" | "status" | "created" | string;
type ColKey =
  | "domain"
  | "status"
  | "created"
  | "industry"
  | "category"
  | "employee_count"
  | "employee_growth_6m"
  | "founded_year"
  | "funding_stage"
  | "total_funding_usd"
  | "investors";

// Enrichment columns default to HIDDEN so the table looks unchanged
// until the recruiter opts in from the columns menu. They fill in as
// companies get enriched (Ajustes-less; data from DataForB2B).
const ENRICHMENT_COLS: ColKey[] = [
  "industry",
  "category",
  "employee_count",
  "employee_growth_6m",
  "founded_year",
  "funding_stage",
  "total_funding_usd",
  "investors",
];

// Column keys + the i18n key for their header label. Labels are
// resolved at render time via the translator (see `useColumns`).
const COLUMN_KEYS: ReadonlyArray<{ key: ColKey; labelKey: string }> = [
  { key: "domain", labelKey: "companiesArea.colDomain" },
  { key: "status", labelKey: "companiesArea.colStatus" },
  { key: "created", labelKey: "companiesArea.colCreated" },
  { key: "industry", labelKey: "companiesArea.colIndustry" },
  { key: "category", labelKey: "companiesArea.colCategory" },
  { key: "employee_count", labelKey: "companiesArea.colEmployeeCount" },
  { key: "employee_growth_6m", labelKey: "companiesArea.colEmployeeGrowth6m" },
  { key: "founded_year", labelKey: "companiesArea.colFoundedYear" },
  { key: "funding_stage", labelKey: "companiesArea.colFundingStage" },
  { key: "total_funding_usd", labelKey: "companiesArea.colTotalFunding" },
  { key: "investors", labelKey: "companiesArea.colInvestors" },
];

/** Resolve column labels for the active locale. */
function useColumns(t: TFunction): ReadonlyArray<{ key: ColKey; label: string }> {
  return useMemo(
    () => COLUMN_KEYS.map(({ key, labelKey }) => ({ key, label: t(labelKey) })),
    [t],
  );
}

/** Compact USD funding display: $1.2M, $850K, $3.4B. */
function formatFundingUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${Math.round(usd / 1e3)}K`;
  return `$${usd}`;
}

/** Count investors stored in the jsonb column (array of strings or
 *  objects). Tolerant of shape; 0 when absent/not-an-array. */
function investorCount(investors: unknown): number {
  return Array.isArray(investors) ? investors.length : 0;
}

// Status label + color now come from the workspace's configurable
// company-status display (Ajustes → Estatus → Estatus de empresas),
// resolved server-side and passed in via `statusConfig`. We render a
// hex-tinted chip (same convention as job statuses) instead of the
// fixed Pill tones so the admin's chosen color shows through.
function StatusChip({ display }: { display: CompanyStatusDisplay }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: display.color + "22", color: display.color }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: display.color }}
      />
      {display.label}
    </span>
  );
}

export function CompaniesTable({
  companies,
  statusConfig,
  statusOrder,
  customFields,
}: {
  companies: CompanyRow[];
  statusConfig: Record<string, CompanyStatusDisplay>;
  /** Status keys in admin-defined order (for filter + picker). */
  statusOrder: string[];
  /** Workspace custom-field definitions + per-company values. */
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
}) {
  const router = useRouter();
  const t = useT();
  const COLUMNS = useColumns(t);
  const [statusFilter, setStatusFilter, resetStatusFilter] = useLocalSet(
    "companies.filter.status",
  );
  const [fundingFilter, setFundingFilter, resetFundingFilter] = useLocalSet(
    "companies.filter.funding",
  );
  // Row selection for bulk actions.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const {
    recent: recentSearches,
    record: recordSearch,
    clear: clearSearchHistory,
  } = useSearchHistory("companies");
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "companies.sort",
    { key: "name", dir: "asc" },
    ["name", "domain", "status"],
  );
  const [hiddenCols, setHiddenCols, resetCols] = useLocalColumns<string>(
    "companies.cols",
    ENRICHMENT_COLS, // enrichment columns hidden by default
  );
  const columnDefs = useMemo(
    () => customFields.definitions.filter((d) => d.is_visible_in_columns),
    [customFields.definitions],
  );
  const DEFAULT_ORDER = useMemo<string[]>(
    () => [
      ...COLUMN_KEYS.map((c) => c.key),
      ...columnDefs.map((d) => d.id),
    ],
    [columnDefs],
  );
  const [orderedKeys, setOrderedKeys, resetOrder] = useLocalColumnOrder<string>(
    "companies.cols",
    DEFAULT_ORDER,
  );
  const visibleOrdered = useMemo(
    () => orderedKeys.filter((k) => !hiddenCols.has(k)),
    [orderedKeys, hiddenCols],
  );
  const visibleColCount =
    1 + // checkbox
    1 + // name (always)
    visibleOrdered.length;

  // Show ALL workspace statuses in the filter, not just those present.
  const allStatuses: string[] = statusOrder;

  // funding_stage is free-text from DfB2B — derive the distinct set
  // present in the loaded data so the filter only offers real values.
  const fundingStages = useMemo(
    () =>
      Array.from(
        new Set(
          companies
            .map((c) => c.funding_stage)
            .filter((s): s is string => Boolean(s)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [companies],
  );

  // Finder results: search jumps to a company; doesn't filter table.
  const searchMatches = useTextFilter(companies, query, (c) => [
    c.name,
    c.domain,
  ]);
  const searchResults: FinderResult[] = useMemo(
    () =>
      searchMatches.slice(0, 12).map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.domain ?? undefined,
        href: `?company=${c.id}`,
      })),
    [searchMatches],
  );

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (statusFilter.size > 0 && !statusFilter.has(c.status)) return false;
      if (
        fundingFilter.size > 0 &&
        !(c.funding_stage && fundingFilter.has(c.funding_stage))
      ) {
        return false;
      }
      return true;
    });
  }, [companies, statusFilter, fundingFilter]);

  const sorted = useMemo(() => {
    const customDef = customFields.definitions.find((d) => d.id === sort.key);
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sort.key === "domain") {
        cmp = (a.domain ?? "").localeCompare(b.domain ?? "");
      } else if (sort.key === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sort.key === "created") {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (customDef) {
        cmp = compareCustomFieldValues(
          customDef,
          customFields.valuesByEntityId[a.id]?.[customDef.id],
          customFields.valuesByEntityId[b.id]?.[customDef.id],
        );
      } else {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [
    filtered,
    sort,
    customFields.definitions,
    customFields.valuesByEntityId,
  ]);

  return (
    <div className="space-y-3">
      <TableFilterBar shown={sorted.length} total={companies.length}>
        <TableSearchFinder
          value={query}
          onChange={setQuery}
          results={searchResults}
          placeholder={t("companiesArea.searchPlaceholder")}
          emptyLabel={t("companiesArea.searchEmpty")}
          recent={recentSearches}
          onRecordSearch={recordSearch}
          onClearHistory={clearSearchHistory}
        />
        <FiltersPopover
          activeCount={statusFilter.size + fundingFilter.size}
          onReset={() => {
            resetStatusFilter();
            resetFundingFilter();
          }}
        >
          <FilterSection
            label={t("companiesArea.filterStatus")}
            options={allStatuses.map((s) => ({
              value: s,
              label: displayFor(statusConfig, s).label,
            }))}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
          {fundingStages.length > 0 ? (
            <FilterSection
              label={t("companiesArea.filterFundingStage")}
              options={fundingStages.map((s) => ({ value: s, label: s }))}
              selected={fundingFilter}
              onChange={setFundingFilter}
            />
          ) : null}
        </FiltersPopover>
        <ColumnVisibilityMenu
          columns={[
            ...COLUMNS,
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
        emptyMessage={t("companiesArea.tableEmpty")}
        stickyColumns={2}
        head={
          <>
            <th className="w-10 px-3 py-3">
              <SelectionCheckbox
                checked={
                  sorted.length > 0 &&
                  sorted.every((c) => selected.has(c.id))
                }
                onChange={(next) => {
                  setSelected((prev) => {
                    const out = new Set(prev);
                    if (next) {
                      for (const c of sorted) out.add(c.id);
                    } else {
                      for (const c of sorted) out.delete(c.id);
                    }
                    return out;
                  });
                }}
                ariaLabel={t("companiesArea.selectAllVisible")}
              />
            </th>
            <SortHeader
              label={t("companiesArea.colName")}
              k="name"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            {/* Visible columns in user-defined order. Core columns
                get SortHeader (they have comparators); enrichment
                columns are plain <th> (sort stays simple). */}
            {visibleOrdered.map((k) => {
              const builtin = COLUMNS.find((c) => c.key === k);
              if (builtin) {
                const isSortable =
                  k === "domain" || k === "status" || k === "created";
                if (isSortable) {
                  return (
                    <SortHeader
                      key={k}
                      label={builtin.label}
                      k={k as "domain" | "status" | "created"}
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                }
                return (
                  <th key={k} className="px-4 py-3 text-left font-medium">
                    {builtin.label}
                  </th>
                );
              }
              // Custom-field dispatch.
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
          </>
        }
      >
        {sorted.map((c) => {
          const href = `/companies?company=${c.id}`;
          return (
            <tr
              key={c.id}
              className={cn(
                "cursor-pointer hover:bg-muted/40",
                selected.has(c.id) ? "bg-accent/5" : "",
              )}
            >
              <td className="px-3 py-3">
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
                  ariaLabel={t("companiesArea.selectRow", { name: c.name })}
                />
              </td>
              <td className="px-4 py-3 font-medium">
                <Link
                  href={href}
                  scroll={false}
                  className="inline-flex items-center gap-2.5"
                >
                  <CompanyLogo
                    src={c.logo_url}
                    domain={c.domain}
                    name={c.name}
                    size="md"
                  />
                  <span className="truncate">{c.name}</span>
                </Link>
              </td>
              {visibleOrdered.map((k) => {
                switch (k) {
                  case "domain":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 text-muted-foreground"
                      >
                        {c.domain ? (
                          <a
                            href={c.website_url ?? `https://${c.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {c.domain}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  case "status":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <StatusPicker
                          company={c}
                          statusConfig={statusConfig}
                          statusOrder={statusOrder}
                        />
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
                  case "industry":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 text-muted-foreground"
                      >
                        {c.industry ?? "—"}
                      </td>
                    );
                  case "category":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 text-muted-foreground"
                      >
                        {c.category ?? "—"}
                      </td>
                    );
                  case "employee_count":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 tabular-nums text-muted-foreground"
                      >
                        {c.employee_count != null
                          ? c.employee_count.toLocaleString("es-MX")
                          : "—"}
                      </td>
                    );
                  case "employee_growth_6m":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 tabular-nums text-muted-foreground"
                      >
                        {c.employee_growth_6m != null
                          ? `${c.employee_growth_6m > 0 ? "+" : ""}${c.employee_growth_6m}%`
                          : "—"}
                      </td>
                    );
                  case "founded_year":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 tabular-nums text-muted-foreground"
                      >
                        {c.founded_year ?? "—"}
                      </td>
                    );
                  case "funding_stage":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 text-muted-foreground"
                      >
                        {c.funding_stage ?? "—"}
                      </td>
                    );
                  case "total_funding_usd":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 tabular-nums text-muted-foreground"
                      >
                        {c.total_funding_usd != null
                          ? formatFundingUsd(Number(c.total_funding_usd))
                          : "—"}
                      </td>
                    );
                  case "investors":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 text-muted-foreground"
                      >
                        {investorCount(c.investors) > 0
                          ? `${investorCount(c.investors)}`
                          : "—"}
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
            </tr>
          );
        })}
      </DataTable>

      <BulkActionsBar
        selectedCount={selected.size}
        onClear={() => setSelected(new Set())}
        entityLabel={t("companiesArea.entityCompany")}
        onDelete={async () => {
          const ids = [...selected];
          const res = await bulkDeleteCompaniesAction(ids);
          if (!res.ok) {
            toast.actionFailed(t("companiesArea.deleteFailed"), res.error);
            return;
          }
          toast.actionOk(
            res.data.deleted === 1
              ? t("companiesArea.deletedOne", { count: res.data.deleted })
              : t("companiesArea.deletedMany", { count: res.data.deleted }),
          );
          router.refresh();
        }}
      />
    </div>
  );
}

/**
 * Inline status picker for the companies table — same affordance the
 * candidates list view has for stages. The chip stays read-style
 * until clicked; on pick we commit optimistically via
 * updateCompanyStatusAction and refresh so the filter chip counters
 * stay in sync. Label + color come from the workspace's configurable
 * status display.
 */
function StatusPicker({
  company,
  statusConfig,
  statusOrder,
}: {
  company: CompanyRow;
  statusConfig: Record<string, CompanyStatusDisplay>;
  statusOrder: string[];
}) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<CompanyStatus>(company.status);

  // Re-sync if the prop changes (post-revalidate after another save).
  useEffect(() => setOptimistic(company.status), [company.status]);

  // Outside-click close — no Radix needed for this small popover.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-status-picker]")) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(next: CompanyStatus) {
    setOpen(false);
    if (next === optimistic) return;
    const prev = optimistic;
    setOptimistic(next);
    startTransition(async () => {
      const res = await updateCompanyStatusAction(company.id, next);
      if (!res.ok) {
        setOptimistic(prev);
        toast.actionFailed(t("companiesArea.statusChangeFailed"), res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="relative inline-block" data-status-picker>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-80"
        aria-label={t("companiesArea.changeStatusOf", { name: company.name })}
      >
        <StatusChip display={displayFor(statusConfig, optimistic)} />
        <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60 group-hover:opacity-100" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
          <ul className="py-1">
            {statusOrder.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-muted",
                    s === optimistic && "bg-muted/60",
                  )}
                >
                  <StatusChip display={displayFor(statusConfig, s)} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
