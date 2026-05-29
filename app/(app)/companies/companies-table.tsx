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
  useLocalColumns,
  useLocalSet,
  useLocalSort,
  useSearchHistory,
  useTextFilter,
} from "../_components/table-controls";
import { CompanyLogo } from "@/components/company-logo";
import {
  COMPANY_STATUS_ORDER,
  type CompanyStatusDisplay,
} from "@/lib/company-status";

type SortKey = "name" | "domain" | "status" | "created";
type ColKey = "domain" | "status" | "created";

const COLUMNS: ReadonlyArray<{ key: ColKey; label: string }> = [
  { key: "domain", label: "Dominio" },
  { key: "status", label: "Estado" },
  { key: "created", label: "Creada" },
];

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
}: {
  companies: CompanyRow[];
  statusConfig: Record<CompanyStatus, CompanyStatusDisplay>;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter, resetStatusFilter] = useLocalSet(
    "companies.filter.status",
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
  const [hiddenCols, setHiddenCols, resetCols] =
    useLocalColumns<ColKey>("companies.cols");
  const showDomain = !hiddenCols.has("domain");
  const showStatus = !hiddenCols.has("status");
  const showCreated = !hiddenCols.has("created");
  const visibleColCount =
    1 + // checkbox
    1 +
    (showDomain ? 1 : 0) +
    (showStatus ? 1 : 0) +
    (showCreated ? 1 : 0);

  // Show ALL valid status values in the filter, not just those present.
  const allStatuses: CompanyStatus[] = COMPANY_STATUS_ORDER;

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
      return true;
    });
  }, [companies, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sort.key === "domain") {
        cmp = (a.domain ?? "").localeCompare(b.domain ?? "");
      } else if (sort.key === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  return (
    <div className="space-y-3">
      <TableFilterBar shown={sorted.length} total={companies.length}>
        <TableSearchFinder
          value={query}
          onChange={setQuery}
          results={searchResults}
          placeholder="Buscar empresa…"
          emptyLabel="Sin empresas que coincidan."
          recent={recentSearches}
          onRecordSearch={recordSearch}
          onClearHistory={clearSearchHistory}
        />
        <FiltersPopover
          activeCount={statusFilter.size}
          onReset={resetStatusFilter}
        >
          <FilterSection
            label="Estado"
            options={allStatuses.map((s) => ({
              value: s,
              label: statusConfig[s].label,
            }))}
            selected={statusFilter}
            onChange={setStatusFilter}
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
        emptyMessage="No hay empresas que coincidan con los filtros."
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
                ariaLabel="Seleccionar todos los visibles"
              />
            </th>
            <SortHeader
              label="Nombre"
              k="name"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            {showDomain ? (
              <SortHeader
                label="Dominio"
                k="domain"
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
            {showCreated ? (
              <SortHeader
                label="Creada"
                k="created"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
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
                  ariaLabel={`Seleccionar ${c.name}`}
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
              {showDomain ? (
                <td className="px-4 py-3 text-muted-foreground">
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
              ) : null}
              {showStatus ? (
                <td
                  className="px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <StatusPicker company={c} statusConfig={statusConfig} />
                </td>
              ) : null}
              {showCreated ? (
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {formatRelative(c.created_at)}
                </td>
              ) : null}
            </tr>
          );
        })}
      </DataTable>

      <BulkActionsBar
        selectedCount={selected.size}
        onClear={() => setSelected(new Set())}
        entityLabel="empresa"
        onDelete={async () => {
          const ids = [...selected];
          const res = await bulkDeleteCompaniesAction(ids);
          if (!res.ok) {
            toast.actionFailed("No se pudo eliminar", res.error);
            return;
          }
          toast.actionOk(
            `${res.data.deleted} empresa${res.data.deleted === 1 ? "" : "s"} eliminada${res.data.deleted === 1 ? "" : "s"}`,
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
}: {
  company: CompanyRow;
  statusConfig: Record<CompanyStatus, CompanyStatusDisplay>;
}) {
  const router = useRouter();
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
        toast.actionFailed("No se pudo cambiar el estado", res.error);
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
        aria-label={`Cambiar estado de ${company.name}`}
      >
        <StatusChip display={statusConfig[optimistic]} />
        <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60 group-hover:opacity-100" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
          <ul className="py-1">
            {COMPANY_STATUS_ORDER.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-muted",
                    s === optimistic && "bg-muted/60",
                  )}
                >
                  <StatusChip display={statusConfig[s]} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
