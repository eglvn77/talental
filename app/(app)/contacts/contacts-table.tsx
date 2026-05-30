"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Linkedin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompanyRow, ContactRow } from "@/lib/hiring";
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
import { CompanyLogo } from "@/components/company-logo";
import {
  BulkActionsBar,
  SelectionCheckbox,
} from "../_components/bulk-actions-bar";
import { bulkDeleteContactsAction } from "./actions";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";

type SortKey = "name" | "title" | "company" | "email" | "created";
type ColKey = "title" | "company" | "email" | "phone" | "created";

export function ContactsTable({
  contacts,
  companiesById,
}: {
  contacts: ContactRow[];
  companiesById: Record<string, CompanyRow>;
}) {
  const t = useT();
  const router = useRouter();
  const COLUMNS: ReadonlyArray<{ key: ColKey; label: string }> = [
    { key: "title", label: t("contactsArea.colTitle") },
    { key: "company", label: t("contactsArea.colCompany") },
    { key: "email", label: t("contactsArea.colEmail") },
    { key: "phone", label: t("contactsArea.colPhone") },
    { key: "created", label: t("contactsArea.colCreated") },
  ];
  // In-memory query (clears on navigation); history is persisted.
  const [query, setQuery] = useState("");
  const {
    recent: recentSearches,
    record: recordSearch,
    clear: clearSearchHistory,
  } = useSearchHistory("contacts");
  const [companyFilter, setCompanyFilter, resetCompanyFilter] = useLocalSet(
    "contacts.company",
  );
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "contacts.sort",
    { key: "created", dir: "desc" },
    ["name", "title", "company", "email"],
  );
  const [hiddenCols, setHiddenCols, resetCols] =
    useLocalColumns<ColKey>("contacts.cols");

  // Row selection for bulk actions.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const showTitle = !hiddenCols.has("title");
  const showCompany = !hiddenCols.has("company");
  const showEmail = !hiddenCols.has("email");
  const showPhone = !hiddenCols.has("phone");
  const showCreated = !hiddenCols.has("created");
  const visibleColCount =
    1 + // checkbox
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

  // Finder results (search jumps to a contact; doesn't filter table).
  const searchMatches = useTextFilter(contacts, query, (c) => [
    c.full_name,
    c.email,
    c.title,
    c.phone,
    c.linkedin_url,
  ]);
  const searchResults: FinderResult[] = useMemo(
    () =>
      searchMatches.slice(0, 12).map((c) => {
        const company = c.company_id ? companiesById[c.company_id] : null;
        return {
          id: c.id,
          title: c.full_name,
          subtitle:
            [c.title, company?.name].filter(Boolean).join(" · ") ||
            c.email ||
            undefined,
          href: `?contact=${c.id}`,
        };
      }),
    [searchMatches, companiesById],
  );

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (companyFilter.size > 0) {
        if (!c.company_id || !companyFilter.has(c.company_id)) return false;
      }
      return true;
    });
  }, [contacts, companyFilter]);

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
        <TableSearchFinder
          value={query}
          onChange={setQuery}
          results={searchResults}
          placeholder={t("contactsArea.searchPlaceholder")}
          emptyLabel={t("contactsArea.searchEmpty")}
          recent={recentSearches}
          onRecordSearch={recordSearch}
          onClearHistory={clearSearchHistory}
        />
        <FiltersPopover
          activeCount={companyFilter.size}
          onReset={resetCompanyFilter}
        >
          <FilterSection
            label={t("contactsArea.colCompany")}
            options={allCompanies.map((c) => ({ value: c.id, label: c.name }))}
            selected={companyFilter}
            onChange={setCompanyFilter}
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
        emptyMessage={t("contactsArea.tableEmpty")}
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
                ariaLabel={t("contactsArea.selectAllVisible")}
              />
            </th>
            <SortHeader
              label={t("contactsArea.colContact")}
              k="name"
              state={sort}
              onToggle={toggleSort}
              className="px-4 py-3 font-medium"
            />
            {showTitle ? (
              <SortHeader
                label={t("contactsArea.colTitle")}
                k="title"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showCompany ? (
              <SortHeader
                label={t("contactsArea.colCompany")}
                k="company"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showEmail ? (
              <SortHeader
                label={t("contactsArea.colEmail")}
                k="email"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showPhone ? (
              <th className="px-4 py-3 text-left font-medium">{t("contactsArea.colPhone")}</th>
            ) : null}
            {showCreated ? (
              <SortHeader
                label={t("contactsArea.colCreated")}
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
                  ariaLabel={t("contactsArea.selectRow", { name: c.full_name })}
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
                  {formatRelative(c.created_at, t)}
                </td>
              ) : null}
            </tr>
          );
        })}
      </DataTable>

      <BulkActionsBar
        selectedCount={selected.size}
        onClear={() => setSelected(new Set())}
        entityLabel={t("contactsArea.entityLabel")}
        onDelete={async () => {
          const ids = [...selected];
          const res = await bulkDeleteContactsAction(ids);
          if (!res.ok) {
            toast.actionFailed(t("contactsArea.deleteFailed"), res.error);
            return;
          }
          toast.actionOk(
            res.data.deleted === 1
              ? t("contactsArea.deletedOne", { count: res.data.deleted })
              : t("contactsArea.deletedMany", { count: res.data.deleted }),
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
