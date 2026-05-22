"use client";

import { useMemo } from "react";
import Link from "next/link";
import { type CompanyRow, type JobRow } from "@/lib/hiring";
import { JOB_STATUS_LABEL, JOB_STATUS_VALUES } from "@/lib/job-status";
import {
  formatRelative,
  MultiSelectFilter,
  SortHeader,
  TableSearch,
  useLocalSet,
  useLocalSort,
  useLocalString,
  useTextFilter,
} from "../_components/table-controls";
import { JobStatusSelect } from "./status-select";
import { JobRowActions } from "./job-row-actions";

type SortKey = "title" | "client" | "status" | "candidates" | "created";

export function JobsTable({
  jobs,
  companiesById,
  candidateCounts,
}: {
  jobs: JobRow[];
  companiesById: Record<string, CompanyRow>;
  candidateCounts: Record<string, number>;
}) {
  const [statusFilter, setStatusFilter] = useLocalSet("jobs.filter.status");
  const [clientFilter, setClientFilter] = useLocalSet("jobs.filter.client");
  const [query, setQuery] = useLocalString("jobs.filter.q");
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "jobs.sort",
    { key: "created", dir: "desc" },
    ["title", "client", "status"],
  );

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

  // Text search across title + client name.
  const searched = useTextFilter(jobs, query, (j) => [
    j.title,
    j.company_id ? companiesById[j.company_id]?.name : null,
  ]);

  const filtered = useMemo(() => {
    return searched.filter((j) => {
      if (statusFilter.size > 0 && !statusFilter.has(j.status)) return false;
      if (clientFilter.size > 0) {
        if (!j.company_id || !clientFilter.has(j.company_id)) return false;
      }
      return true;
    });
  }, [searched, statusFilter, clientFilter]);

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
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder="Buscar por título o empresa…"
        />
        <MultiSelectFilter
          label="Estado"
          options={allStatuses.map((s) => ({
            value: s,
            label: JOB_STATUS_LABEL[s as keyof typeof JOB_STATUS_LABEL] ?? s,
          }))}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
        <MultiSelectFilter
          label="Empresa"
          options={allClients.map((c) => ({ value: c.id, label: c.name }))}
          selected={clientFilter}
          onChange={setClientFilter}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {sorted.length} de {jobs.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortHeader
                label="Vacante"
                k="title"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
              <SortHeader
                label="Empresa"
                k="client"
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
                label="Candidatos"
                k="candidates"
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
              <th className="w-10 px-4 py-3" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-xs text-muted-foreground"
                >
                  No hay vacantes que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              sorted.map((j) => {
                const company = j.company_id
                  ? companiesById[j.company_id]
                  : null;
                const appCount = candidateCounts[j.id] ?? 0;
                return (
                  <tr key={j.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/jobs/${j.id}`}
                        className="hover:underline"
                      >
                        {j.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {company?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <JobStatusSelect jobId={j.id} current={j.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {appCount}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatRelative(
                        (j.open_date ? `${j.open_date}T00:00:00Z` : null) ??
                          j.published_at ??
                          j.created_at,
                      )}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <JobRowActions
                        jobId={j.id}
                        title={j.title}
                        applicationCount={appCount}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
