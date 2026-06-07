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
  useLocalColumnOrder,
  useLocalColumns,
  useUrlSet,
  useUrlSort,
  useUrlString,
  useSearchHistory,
  type FinderResult,
} from "../_components/table-controls";
import { CompanyLogo } from "@/components/company-logo";
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
import { bulkDeleteContactsAction } from "./actions";
import {
  BulkCustomFieldPopover,
  type BulkEditField,
} from "../_components/bulk-custom-field-popover";
import { BulkTagsPopover } from "../_components/bulk-tags-popover";
import { TablePagination } from "../_components/table-pagination";
import { useEscToClearSelection } from "@/lib/use-dialog-shortcuts";
import {
  bulkUpdateContactCompanyAction,
  bulkUpdateContactOwnerAction,
  loadAssignableMembersAction,
} from "../actions";
import { bulkUpdateCustomFieldValueAction } from "../settings/actions";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";

type SortKey =
  | "name"
  | "title"
  | "company"
  | "email"
  | "created"
  | string;
type ColKey = "title" | "company" | "email" | "phone" | "created";

export function ContactsTable({
  contacts,
  companiesById,
  customFields,
  total,
}: {
  contacts: ContactRow[];
  companiesById: Record<string, CompanyRow>;
  /** Workspace custom-field definitions + per-contact values. */
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
  /** Total rows across the full dataset for server-side pagination. */
  total: number;
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
  // URL-driven so filters/sort/search work across the full DB.
  const [query, setQuery] = useUrlString("q");
  const {
    recent: recentSearches,
    record: recordSearch,
    clear: clearSearchHistory,
  } = useSearchHistory("contacts");
  const [companyFilter, setCompanyFilter, resetCompanyFilter] = useUrlSet("company");
  const [sort, toggleSort] = useUrlSort<SortKey>("created", "desc");
  const [hiddenCols, setHiddenCols, resetCols] =
    useLocalColumns<string>("contacts.cols");
  const columnDefs = useMemo(
    () => customFields.definitions.filter((d) => d.is_visible_in_columns),
    [customFields.definitions],
  );
  const BUILTIN_ORDER: ColKey[] = [
    "title",
    "company",
    "email",
    "phone",
    "created",
  ];
  const DEFAULT_ORDER = useMemo<string[]>(
    () => [...BUILTIN_ORDER, ...columnDefs.map((d) => d.id)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnDefs],
  );
  const [orderedKeys, setOrderedKeys, resetOrder] = useLocalColumnOrder<string>(
    "contacts.cols",
    DEFAULT_ORDER,
  );
  const visibleOrdered = useMemo(
    () => orderedKeys.filter((k) => !hiddenCols.has(k)),
    [orderedKeys, hiddenCols],
  );

  // Row selection for bulk actions.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEscToClearSelection({
    enabled: selected.size > 0,
    clear: () => setSelected(new Set()),
  });

  const visibleColCount =
    1 + // checkbox
    1 + // name (locked)
    visibleOrdered.length;

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

  // Server returns the right page filtered+sorted. Aliases keep the
  // JSX below stable. Custom-field sort runs client-side over the
  // visible page.
  const searchResults: FinderResult[] = useMemo(
    () =>
      contacts.slice(0, 12).map((c) => {
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
    [contacts, companiesById],
  );

  const filtered = contacts;
  const sorted = useMemo(() => {
    const customDef = customFields.definitions.find((d) => d.id === sort.key);
    if (!customDef) return filtered;
    const arr = filtered.slice();
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
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
  }, [
    filtered,
    sort,
    customFields.definitions,
    customFields.valuesByEntityId,
  ]);
  void companiesById;

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
        emptyMessage={t("contactsArea.tableEmpty")}
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
            {visibleOrdered.map((k) => {
              switch (k) {
                case "title":
                  return (
                    <SortHeader
                      key={k}
                      label={t("contactsArea.colTitle")}
                      k="title"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                case "company":
                  return (
                    <SortHeader
                      key={k}
                      label={t("contactsArea.colCompany")}
                      k="company"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                case "email":
                  return (
                    <SortHeader
                      key={k}
                      label={t("contactsArea.colEmail")}
                      k="email"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
                case "phone":
                  return (
                    <th
                      key={k}
                      className="px-4 py-3 text-left font-medium"
                    >
                      {t("contactsArea.colPhone")}
                    </th>
                  );
                case "created":
                  return (
                    <SortHeader
                      key={k}
                      label={t("contactsArea.colCreated")}
                      k="created"
                      state={sort}
                      onToggle={toggleSort}
                      className="px-4 py-3 font-medium"
                    />
                  );
              }
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
          const company = c.company_id ? companiesById[c.company_id] : null;
          const href = `?contact=${c.id}`;
          return (
            <tr
              key={c.id}
              data-selected={selected.has(c.id) ? "true" : undefined}
              onClick={() => router.push(href, { scroll: false })}
              className={cn(
                "cursor-pointer transition-colors hover:bg-row-hover",
                selected.has(c.id) ? "bg-row-selected" : "",
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
              {visibleOrdered.map((k) => {
                switch (k) {
                  case "title":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 text-muted-foreground"
                      >
                        {c.title ?? "—"}
                      </td>
                    );
                  case "company":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 text-muted-foreground"
                      >
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
                    );
                  case "email":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 text-muted-foreground"
                      >
                        {c.email ?? "—"}
                      </td>
                    );
                  case "phone":
                    return (
                      <td
                        key={k}
                        className="px-4 py-3 font-mono text-xs text-muted-foreground"
                      >
                        {c.phone ?? "—"}
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
            </tr>
          );
        })}
      </DataTable>

      <TablePagination total={total} />

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
      >
        <BulkCustomFieldPopover
          selectedIds={selected}
          fields={[
            // Built-in: contact owner (team_members.id). Loads
            // assignable members lazily on first pick.
            {
              id: "builtin:owner_id",
              label: t("contactsArea.colOwner"),
              kind: "select",
              loadOptions: async () => {
                const res = await loadAssignableMembersAction();
                if (!res.ok) return [];
                return res.data.map((m) => ({
                  value: m.id,
                  label: m.full_name,
                }));
              },
              apply: (ids, value) =>
                bulkUpdateContactOwnerAction(
                  ids,
                  value === null ? null : String(value),
                ),
            },
            // Built-in: link to company. Pulled from props (page
            // already loads companiesById for the table cells) so no
            // async fetch is needed.
            {
              id: "builtin:company_id",
              label: t("contactsArea.colCompany"),
              kind: "select",
              options: Object.values(companiesById)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => ({ value: c.id, label: c.name })),
              apply: (ids, value) =>
                bulkUpdateContactCompanyAction(
                  ids,
                  value === null ? null : String(value),
                ),
            },
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
          entityType="contact"
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
