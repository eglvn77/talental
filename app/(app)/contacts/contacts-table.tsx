"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Linkedin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompanyRow, ContactRow } from "@/lib/hiring";
import {
  ColumnVisibilityMenu,
  DataTable,
  MultiSelectFilter,
  SortHeader,
  TableFilterBar,
  TableSearch,
  formatRelative,
  useLocalColumns,
  useLocalSet,
  useLocalSort,
  useLocalString,
  useTextFilter,
} from "../_components/table-controls";
import { CompanyLogo } from "@/components/company-logo";

type SortKey = "name" | "title" | "company" | "email" | "created";
type ColKey = "title" | "company" | "email" | "phone" | "created";

const COLUMNS: ReadonlyArray<{ key: ColKey; label: string }> = [
  { key: "title", label: "Puesto" },
  { key: "company", label: "Empresa" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Teléfono" },
  { key: "created", label: "Agregado" },
];

export function ContactsTable({
  contacts,
  companiesById,
}: {
  contacts: ContactRow[];
  companiesById: Record<string, CompanyRow>;
}) {
  const router = useRouter();
  const [query, setQuery] = useLocalString("contacts.search", "");
  const [companyFilter, setCompanyFilter] = useLocalSet("contacts.company");
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "contacts.sort",
    { key: "created", dir: "desc" },
    ["name", "title", "company", "email"],
  );
  const [hiddenCols, setHiddenCols] = useLocalColumns<ColKey>("contacts.cols");

  const showTitle = !hiddenCols.has("title");
  const showCompany = !hiddenCols.has("company");
  const showEmail = !hiddenCols.has("email");
  const showPhone = !hiddenCols.has("phone");
  const showCreated = !hiddenCols.has("created");
  const visibleColCount =
    1 +
    (showTitle ? 1 : 0) +
    (showCompany ? 1 : 0) +
    (showEmail ? 1 : 0) +
    (showPhone ? 1 : 0) +
    (showCreated ? 1 : 0);

  const allCompanies = useMemo(() => {
    const m = new Map<string, CompanyRow>();
    for (const c of contacts) {
      if (c.company_id) {
        const co = companiesById[c.company_id];
        if (co) m.set(co.id, co);
      }
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, companiesById]);

  const searched = useTextFilter(contacts, query, (c) => [
    c.full_name,
    c.email,
    c.title,
    c.phone,
    c.linkedin_url,
  ]);

  const filtered = useMemo(() => {
    return searched.filter((c) => {
      if (companyFilter.size > 0) {
        if (!c.company_id || !companyFilter.has(c.company_id)) return false;
      }
      return true;
    });
  }, [searched, companyFilter]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.full_name.localeCompare(b.full_name) * dir;
        case "title":
          return (a.title ?? "").localeCompare(b.title ?? "") * dir;
        case "company": {
          const an = a.company_id ? companiesById[a.company_id]?.name ?? "" : "";
          const bn = b.company_id ? companiesById[b.company_id]?.name ?? "" : "";
          return an.localeCompare(bn) * dir;
        }
        case "email":
          return (a.email ?? "").localeCompare(b.email ?? "") * dir;
        case "created":
          return a.created_at.localeCompare(b.created_at) * dir;
      }
    });
    return arr;
  }, [filtered, sort, companiesById]);

  return (
    <div className="space-y-3">
      <TableFilterBar shown={sorted.length} total={contacts.length}>
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder="Buscar por nombre, email, puesto…"
        />
        <MultiSelectFilter
          label="Empresa"
          options={allCompanies.map((c) => ({ value: c.id, label: c.name }))}
          selected={companyFilter}
          onChange={setCompanyFilter}
        />
        <ColumnVisibilityMenu
          columns={COLUMNS}
          hidden={hiddenCols}
          onChange={setHiddenCols}
        />
      </TableFilterBar>

      <DataTable
        colSpan={visibleColCount}
        isEmpty={sorted.length === 0}
        emptyMessage="No hay contactos que coincidan con los filtros."
        head={
          <>
            <SortHeader
              label="Contacto"
              k="name"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            {showTitle ? (
              <SortHeader
                label="Puesto"
                k="title"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showCompany ? (
              <SortHeader
                label="Empresa"
                k="company"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showEmail ? (
              <SortHeader
                label="Email"
                k="email"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showPhone ? (
              <th className="px-4 py-3 text-left font-medium">Teléfono</th>
            ) : null}
            {showCreated ? (
              <SortHeader
                label="Agregado"
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
          const company = c.company_id ? companiesById[c.company_id] : null;
          const href = `?contact=${c.id}`;
          return (
            <tr
              key={c.id}
              onClick={() => router.push(href, { scroll: false })}
              className={cn("cursor-pointer transition-colors hover:bg-muted/40")}
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
                    <span className="truncate font-medium">{c.full_name}</span>
                    {c.linkedin_url ? (
                      <a
                        href={c.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        <Linkedin className="h-3 w-3" />
                        LinkedIn
                      </a>
                    ) : null}
                  </div>
                </div>
              </td>
              {showTitle ? (
                <td className="px-4 py-3 text-muted-foreground">
                  {c.title ?? "—"}
                </td>
              ) : null}
              {showCompany ? (
                <td className="px-4 py-3 text-muted-foreground">
                  {company ? (
                    <span className="inline-flex items-center gap-2">
                      <CompanyLogo
                        src={company.logo_url}
                        domain={company.domain}
                        name={company.name}
                        size="sm"
                      />
                      <span className="truncate">{company.name}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              ) : null}
              {showEmail ? (
                <td className="px-4 py-3 text-muted-foreground">
                  {c.email ?? "—"}
                </td>
              ) : null}
              {showPhone ? (
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {c.phone ?? "—"}
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
