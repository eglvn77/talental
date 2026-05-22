"use client";

import { useMemo } from "react";
import Link from "next/link";
import { type CompanyRow, type CompanyStatus } from "@/lib/hiring";
import {
  DataTable,
  formatRelative,
  MultiSelectFilter,
  SortHeader,
  TableFilterBar,
  TableSearch,
  useLocalSet,
  useLocalSort,
  useLocalString,
  useTextFilter,
} from "../_components/table-controls";

type SortKey = "name" | "domain" | "status" | "created";

const STATUS_LABEL: Record<CompanyStatus, string> = {
  client: "Cliente",
  prospect: "Prospecto",
  partner: "Aliado",
  none: "Otra",
};

const STATUS_COLOR: Record<CompanyStatus, string> = {
  client: "#22c55e",
  prospect: "#f97316",
  partner: "#3b82f6",
  none: "#94a3b8",
};

export function CompaniesTable({ companies }: { companies: CompanyRow[] }) {
  const [statusFilter, setStatusFilter] = useLocalSet("companies.filter.status");
  const [query, setQuery] = useLocalString("companies.filter.q");
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "companies.sort",
    { key: "name", dir: "asc" },
    ["name", "domain", "status"],
  );

  // Show ALL valid status values in the filter, not just those present.
  const allStatuses: CompanyStatus[] = ["client", "prospect", "partner", "none"];

  const searched = useTextFilter(companies, query, (c) => [
    c.name,
    c.domain,
  ]);

  const filtered = useMemo(() => {
    return searched.filter((c) => {
      if (statusFilter.size > 0 && !statusFilter.has(c.status)) return false;
      return true;
    });
  }, [searched, statusFilter]);

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
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder="Buscar por nombre o dominio…"
        />
        <MultiSelectFilter
          label="Estado"
          options={allStatuses.map((s) => ({
            value: s,
            label: STATUS_LABEL[s as CompanyStatus] ?? s,
          }))}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
      </TableFilterBar>

      <DataTable
        colSpan={4}
        isEmpty={sorted.length === 0}
        emptyMessage="No hay empresas que coincidan con los filtros."
        head={
          <>
            <SortHeader
              label="Nombre"
              k="name"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            <SortHeader
              label="Dominio"
              k="domain"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            <SortHeader
              label="Estado"
              k="status"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            <SortHeader
              label="Creada"
              k="created"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
          </>
        }
      >
        {sorted.map((c) => {
          const href = `/companies?company=${c.id}`;
          return (
            <tr key={c.id} className="cursor-pointer hover:bg-muted/40">
              <td className="px-4 py-3 font-medium">
                <Link href={href} scroll={false}>
                  {c.name}
                </Link>
              </td>
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
              <td className="px-4 py-3">
                <StatusPill status={c.status} />
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {formatRelative(c.created_at)}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}

function StatusPill({ status }: { status: CompanyStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5 text-xs">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
