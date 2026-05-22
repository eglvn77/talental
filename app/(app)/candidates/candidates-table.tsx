"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, FileText, Linkedin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CandidateSource } from "@/lib/hiring";
import {
  DataTable,
  MultiSelectFilter,
  SortHeader,
  TableFilterBar,
  TableSearch,
  formatRelative,
  useLocalSet,
  useLocalSort,
  useLocalString,
  useTextFilter,
} from "../_components/table-controls";

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

const SOURCE_LABEL: Record<CandidateSource, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  referral: "Referencia",
  direct: "Directo",
  bulk_import: "Importado",
  other: "Otro",
};

type SortKey = "name" | "email" | "source" | "applications" | "created";

export function CandidatesTable({
  candidates,
}: {
  candidates: CandidateListRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useLocalString("candidates.search", "");
  const [sourceFilter, setSourceFilter] = useLocalSet("candidates.source");
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "candidates.sort",
    { key: "created", dir: "desc" },
    ["name", "email", "source"],
  );

  // Text search across name / email / linkedin / phone.
  const searched = useTextFilter(candidates, search, (c) => [
    c.full_name,
    c.email,
    c.linkedin_url,
    c.phone,
  ]);

  // Source filter.
  const filtered = useMemo(() => {
    if (sourceFilter.size === 0) return searched;
    return searched.filter((c) =>
      c.default_source ? sourceFilter.has(c.default_source) : false,
    );
  }, [searched, sourceFilter]);

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
        label: SOURCE_LABEL[s as CandidateSource] ?? s,
      }));
  }, [candidates]);

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

  function rowHref(c: CandidateListRow): string | null {
    const recent = c.applications[0];
    if (!recent) return null;
    return `/jobs/${recent.job_id}?contact=${recent.id}`;
  }

  return (
    <div className="space-y-3">
      <TableFilterBar shown={sorted.length} total={candidates.length}>
        <TableSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, email, LinkedIn…"
        />
        <MultiSelectFilter
          label="Origen"
          options={sourceOptions}
          selected={sourceFilter}
          onChange={setSourceFilter}
        />
      </TableFilterBar>

      <DataTable
        colSpan={6}
        isEmpty={sorted.length === 0}
        emptyMessage="Sin resultados."
        head={
          <>
            <SortHeader
              label="Candidato"
              k="name"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            <SortHeader
              label="Email"
              k="email"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            <SortHeader
              label="Origen"
              k="source"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            <SortHeader
              label="Aplicaciones"
              k="applications"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            <SortHeader
              label="Agregado"
              k="created"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            <th className="w-8 px-2 py-3" />
          </>
        }
      >
        {sorted.map((c) => {
                const href = rowHref(c);
                const recent = c.applications[0];
                const recentJob = recent
                  ? (Array.isArray(recent.job) ? recent.job[0] : recent.job)
                  : null;
                return (
                  <tr
                    key={c.id}
                    onClick={() => {
                      if (href) router.push(href);
                    }}
                    className={cn(
                      "transition-colors",
                      href ? "cursor-pointer hover:bg-muted/40" : "",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium"
                          aria-hidden
                        >
                          {initials(c.full_name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {c.full_name}
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
                            title="Tiene CV"
                          >
                            <FileText className="h-3 w-3" />
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.default_source
                        ? SOURCE_LABEL[c.default_source]
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.applications.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Sin aplicaciones
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
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatRelative(c.created_at)}
                    </td>
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
