"use client";

import { useMemo } from "react";
import Link from "next/link";
import type {
  CompanyRow,
  ContactRow,
  JobRow,
  TeamMemberRow,
} from "@/lib/hiring";
import { JOB_STATUS_LABEL, JOB_STATUS_TONE, JOB_STATUS_VALUES } from "@/lib/job-status";
import { deriveJobFinance, formatMoney, type JobFinance } from "@/lib/jobs/finance";
import {
  ColumnVisibilityMenu,
  DataTable,
  FilterSection,
  FiltersPopover,
  SortHeader,
  TableFilterBar,
  TableSearch,
  useLocalColumns,
  useLocalSet,
  useLocalSort,
  useLocalString,
  useTextFilter,
} from "../_components/table-controls";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Pill } from "@/components/ui/pill";
import { CompanyLogo } from "@/components/company-logo";

type SortKey =
  | "title"
  | "client"
  | "status"
  | "midpoint"
  | "fee_amount"
  | "retainer_amount"
  | "placement_balance"
  | "talental_net"
  | "created";

type ColKey =
  | "client"
  | "status"
  | "billing"
  | "fee_model"
  | "midpoint"
  | "fee_months"
  | "fee_amount"
  | "retainer_amount"
  | "placement_balance"
  | "sourcer"
  | "recruiter_amount"
  | "lead"
  | "lead_amount"
  | "talental_net"
  | "created";

const COLUMNS: ReadonlyArray<{ key: ColKey; label: string }> = [
  { key: "client", label: "Empresa" },
  { key: "status", label: "Estado" },
  { key: "billing", label: "Factura" },
  { key: "fee_model", label: "Modelo" },
  { key: "midpoint", label: "Midpoint" },
  { key: "fee_months", label: "Meses" },
  { key: "fee_amount", label: "Fee aproximado" },
  { key: "retainer_amount", label: "Anticipo" },
  { key: "placement_balance", label: "Saldo placement" },
  { key: "sourcer", label: "Sourcer" },
  { key: "recruiter_amount", label: "Sourcer $" },
  { key: "lead", label: "Lead" },
  { key: "lead_amount", label: "Lead $" },
  { key: "talental_net", label: "Net Talental" },
  { key: "created", label: "Creada" },
];

// Default-show the columns that mirror the original Sheets layout
// most closely. The deeper P&L columns are one click away in the
// Columnas menu.
const INITIAL_HIDDEN: ReadonlyArray<ColKey> = [
  "fee_months",
  "sourcer",
  "lead",
];

const BILLING_LABEL: Record<string, string> = {
  invoice: "Invoice",
  factura: "Factura",
};

const FEE_MODEL_LABEL: Record<string, string> = {
  retained: "Anticipo",
  contingent: "Éxito",
};

function MoneyCell({
  amount,
  currency,
}: {
  amount: number | null;
  currency: string;
}) {
  return (
    <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-fg-2">
      {formatMoney(amount, currency)}
    </td>
  );
}

export function FinancesTable({
  jobs,
  companiesById,
  contactsById,
  teamMembersById,
}: {
  jobs: JobRow[];
  companiesById: Record<
    string,
    Pick<CompanyRow, "id" | "name" | "domain" | "logo_url" | "status">
  >;
  contactsById: Record<string, Pick<ContactRow, "id" | "full_name">>;
  teamMembersById: Record<
    string,
    Pick<TeamMemberRow, "id" | "full_name" | "email">
  >;
}) {
  const [statusFilter, setStatusFilter, resetStatusFilter] = useLocalSet(
    "finances.filter.status",
    ["activa"],
  );
  const [clientFilter, setClientFilter, resetClientFilter] = useLocalSet(
    "finances.filter.client",
  );
  const [feeModelFilter, setFeeModelFilter, resetFeeModelFilter] = useLocalSet(
    "finances.filter.fee_model",
  );
  const [currencyFilter, setCurrencyFilter, resetCurrencyFilter] = useLocalSet(
    "finances.filter.currency",
  );
  const [query, setQuery] = useLocalString("finances.filter.q");
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "finances.sort",
    { key: "fee_amount", dir: "desc" },
    ["title", "client", "status"],
  );
  const [hiddenCols, setHiddenCols, resetCols] = useLocalColumns<ColKey>(
    "finances.cols",
    INITIAL_HIDDEN,
  );

  function resetFilters() {
    resetStatusFilter();
    resetClientFilter();
    resetFeeModelFilter();
    resetCurrencyFilter();
  }
  const shown = (k: ColKey) => !hiddenCols.has(k);

  // Memoise per-row finance projections.
  const financeByJobId = useMemo(() => {
    const m = new Map<string, JobFinance>();
    for (const j of jobs) m.set(j.id, deriveJobFinance(j));
    return m;
  }, [jobs]);

  // Filter option enumerations.
  const allClients = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const j of jobs) {
      if (j.company_id && companiesById[j.company_id]) {
        const c = companiesById[j.company_id];
        m.set(c.id, { id: c.id, name: c.name });
      }
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs, companiesById]);
  const allCurrencies = useMemo(() => {
    const s = new Set<string>();
    for (const j of jobs) s.add(j.salary_currency ?? "MXN");
    return Array.from(s).sort();
  }, [jobs]);

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
      if (feeModelFilter.size > 0) {
        if (!j.fee_model || !feeModelFilter.has(j.fee_model)) return false;
      }
      if (currencyFilter.size > 0) {
        if (!currencyFilter.has(j.salary_currency ?? "MXN")) return false;
      }
      return true;
    });
  }, [searched, statusFilter, clientFilter, feeModelFilter, currencyFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const finance = (id: string) => financeByJobId.get(id);
    arr.sort((a, b) => {
      let cmp = 0;
      const fa = finance(a.id);
      const fb = finance(b.id);
      const nullsLast = (x: number | null, y: number | null) => {
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return x - y;
      };
      switch (sort.key) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "client": {
          const an = a.company_id ? companiesById[a.company_id]?.name ?? "" : "";
          const bn = b.company_id ? companiesById[b.company_id]?.name ?? "" : "";
          cmp = an.localeCompare(bn);
          break;
        }
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "midpoint":
          cmp = nullsLast(fa?.midpoint ?? null, fb?.midpoint ?? null);
          break;
        case "fee_amount":
          cmp = nullsLast(fa?.feeAmount ?? null, fb?.feeAmount ?? null);
          break;
        case "retainer_amount":
          cmp = nullsLast(
            fa?.retainerAmount ?? null,
            fb?.retainerAmount ?? null,
          );
          break;
        case "placement_balance":
          cmp = nullsLast(
            fa?.placementBalance ?? null,
            fb?.placementBalance ?? null,
          );
          break;
        case "talental_net":
          cmp = nullsLast(fa?.talentalNet ?? null, fb?.talentalNet ?? null);
          break;
        case "created":
        default:
          cmp =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort, companiesById, financeByJobId]);

  // Aggregate totals by currency across the filtered rows. We never
  // FX-convert; mixing MXN + USD in one number would be lying.
  type Totals = {
    fee: number;
    retainer: number;
    balance: number;
    sourcer: number;
    lead: number;
    net: number;
    count: number;
  };
  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, Totals>();
    for (const j of filtered) {
      const f = financeByJobId.get(j.id);
      if (!f) continue;
      const cur = f.currency;
      const t = m.get(cur) ?? {
        fee: 0,
        retainer: 0,
        balance: 0,
        sourcer: 0,
        lead: 0,
        net: 0,
        count: 0,
      };
      t.fee += f.feeAmount ?? 0;
      t.retainer += f.retainerAmount ?? 0;
      t.balance += f.placementBalance ?? 0;
      t.sourcer += f.recruiterAmount ?? 0;
      t.lead += f.leadAmount ?? 0;
      t.net += f.talentalNet ?? 0;
      t.count += 1;
      m.set(cur, t);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, financeByJobId]);

  function sourcerLabel(j: JobRow): string {
    if (!j.recruiter_team_member_id) return "—";
    const m = teamMembersById[j.recruiter_team_member_id];
    if (!m) return "—";
    return m.full_name?.trim() || m.email;
  }

  function leadLabel(j: JobRow): string {
    if (j.lead_contact_id) {
      return contactsById[j.lead_contact_id]?.full_name ?? "—";
    }
    if (j.lead_company_id) {
      return companiesById[j.lead_company_id]?.name ?? "—";
    }
    return "—";
  }

  const visibleColCount =
    1 + // title locked
    (shown("client") ? 1 : 0) +
    (shown("status") ? 1 : 0) +
    (shown("billing") ? 1 : 0) +
    (shown("fee_model") ? 1 : 0) +
    (shown("midpoint") ? 1 : 0) +
    (shown("fee_months") ? 1 : 0) +
    (shown("fee_amount") ? 1 : 0) +
    (shown("retainer_amount") ? 1 : 0) +
    (shown("placement_balance") ? 1 : 0) +
    (shown("sourcer") ? 1 : 0) +
    (shown("recruiter_amount") ? 1 : 0) +
    (shown("lead") ? 1 : 0) +
    (shown("lead_amount") ? 1 : 0) +
    (shown("talental_net") ? 1 : 0) +
    (shown("created") ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Summary strip: one card per currency present in the filter. */}
      {totalsByCurrency.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {totalsByCurrency.map(([cur, t]) => (
            <div
              key={cur}
              className="rounded-[10px] border border-border-soft bg-bg-2 p-4"
            >
              <div className="flex items-center justify-between">
                <Eyebrow>
                  {cur} · {t.count} vacante{t.count === 1 ? "" : "s"}
                </Eyebrow>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <Stat label="Fee" value={formatMoney(t.fee, cur)} />
                <Stat label="Anticipo" value={formatMoney(t.retainer, cur)} />
                <Stat label="Saldo" value={formatMoney(t.balance, cur)} />
                <Stat label="Sourcer" value={formatMoney(t.sourcer, cur)} />
                <Stat label="Lead" value={formatMoney(t.lead, cur)} />
                <Stat
                  label="Net Talental"
                  value={formatMoney(t.net, cur)}
                  accent
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <TableFilterBar shown={sorted.length} total={jobs.length}>
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder="Buscar por vacante o empresa…"
        />
        <FiltersPopover
          activeCount={
            statusFilter.size +
            clientFilter.size +
            feeModelFilter.size +
            currencyFilter.size
          }
          onReset={resetFilters}
        >
          <FilterSection
            label="Estado"
            options={JOB_STATUS_VALUES.map((s) => ({
              value: s,
              label: JOB_STATUS_LABEL[s as keyof typeof JOB_STATUS_LABEL] ?? s,
            }))}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
          <FilterSection
            label="Modelo de fee"
            options={[
              { value: "retained", label: "Con anticipo" },
              { value: "contingent", label: "Al éxito" },
            ]}
            selected={feeModelFilter}
            onChange={setFeeModelFilter}
          />
          <FilterSection
            label="Moneda"
            options={allCurrencies.map((c) => ({ value: c, label: c }))}
            selected={currencyFilter}
            onChange={setCurrencyFilter}
          />
          <FilterSection
            label="Empresa"
            options={allClients.map((c) => ({ value: c.id, label: c.name }))}
            selected={clientFilter}
            onChange={setClientFilter}
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
        emptyMessage="No hay vacantes que coincidan con los filtros."
        head={
          <>
            <SortHeader
              label="Vacante"
              k="title"
              state={sort}
              onToggle={toggleSort}
              className="px-3 py-2.5 font-medium"
            />
            {shown("client") ? (
              <SortHeader
                label="Empresa"
                k="client"
                state={sort}
                onToggle={toggleSort}
                className="px-3 py-2.5 font-medium"
              />
            ) : null}
            {shown("status") ? (
              <SortHeader
                label="Estado"
                k="status"
                state={sort}
                onToggle={toggleSort}
                className="px-3 py-2.5 font-medium"
              />
            ) : null}
            {shown("billing") ? (
              <th className="px-3 py-2.5 text-left font-medium">Factura</th>
            ) : null}
            {shown("fee_model") ? (
              <th className="px-3 py-2.5 text-left font-medium">Modelo</th>
            ) : null}
            {shown("midpoint") ? (
              <SortHeader
                label="Midpoint"
                k="midpoint"
                state={sort}
                onToggle={toggleSort}
                className="px-3 py-2.5 font-medium"
              />
            ) : null}
            {shown("fee_months") ? (
              <th className="px-3 py-2.5 text-left font-medium">Meses</th>
            ) : null}
            {shown("fee_amount") ? (
              <SortHeader
                label="Fee aprox."
                k="fee_amount"
                state={sort}
                onToggle={toggleSort}
                className="px-3 py-2.5 font-medium"
              />
            ) : null}
            {shown("retainer_amount") ? (
              <SortHeader
                label="Anticipo"
                k="retainer_amount"
                state={sort}
                onToggle={toggleSort}
                className="px-3 py-2.5 font-medium"
              />
            ) : null}
            {shown("placement_balance") ? (
              <SortHeader
                label="Saldo"
                k="placement_balance"
                state={sort}
                onToggle={toggleSort}
                className="px-3 py-2.5 font-medium"
              />
            ) : null}
            {shown("sourcer") ? (
              <th className="px-3 py-2.5 text-left font-medium">Sourcer</th>
            ) : null}
            {shown("recruiter_amount") ? (
              <th className="px-3 py-2.5 text-left font-medium">Sourcer $</th>
            ) : null}
            {shown("lead") ? (
              <th className="px-3 py-2.5 text-left font-medium">Lead</th>
            ) : null}
            {shown("lead_amount") ? (
              <th className="px-3 py-2.5 text-left font-medium">Lead $</th>
            ) : null}
            {shown("talental_net") ? (
              <SortHeader
                label="Net Talental"
                k="talental_net"
                state={sort}
                onToggle={toggleSort}
                className="px-3 py-2.5 font-medium"
              />
            ) : null}
            {shown("created") ? (
              <SortHeader
                label="Creada"
                k="created"
                state={sort}
                onToggle={toggleSort}
                className="px-3 py-2.5 font-medium"
              />
            ) : null}
          </>
        }
      >
        {sorted.map((j) => {
          const company = j.company_id ? companiesById[j.company_id] : null;
          const f = financeByJobId.get(j.id);
          const currency = f?.currency ?? "MXN";
          return (
            <tr key={j.id}>
              <td className="px-3 py-2.5 font-medium">
                <Link href={`/jobs/${j.id}`} className="hover:underline">
                  {j.title}
                </Link>
              </td>
              {shown("client") ? (
                <td className="px-3 py-2.5 text-muted-foreground">
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
              {shown("status") ? (
                <td className="px-3 py-2.5">
                  <Pill tone={JOB_STATUS_TONE[j.status]} dot>
                    {JOB_STATUS_LABEL[j.status]}
                  </Pill>
                </td>
              ) : null}
              {shown("billing") ? (
                <td className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                  {j.billing_format ? BILLING_LABEL[j.billing_format] : "—"}
                </td>
              ) : null}
              {shown("fee_model") ? (
                <td className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                  {j.fee_model ? FEE_MODEL_LABEL[j.fee_model] : "—"}
                </td>
              ) : null}
              {shown("midpoint") ? (
                <MoneyCell amount={f?.midpoint ?? null} currency={currency} />
              ) : null}
              {shown("fee_months") ? (
                <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-fg-2">
                  {j.fee_months != null ? `${Number(j.fee_months)}m` : "—"}
                </td>
              ) : null}
              {shown("fee_amount") ? (
                <MoneyCell amount={f?.feeAmount ?? null} currency={currency} />
              ) : null}
              {shown("retainer_amount") ? (
                <MoneyCell
                  amount={f?.retainerAmount ?? null}
                  currency={currency}
                />
              ) : null}
              {shown("placement_balance") ? (
                <MoneyCell
                  amount={f?.placementBalance ?? null}
                  currency={currency}
                />
              ) : null}
              {shown("sourcer") ? (
                <td className="px-3 py-2.5 text-xs text-fg-2">
                  {sourcerLabel(j)}
                </td>
              ) : null}
              {shown("recruiter_amount") ? (
                <MoneyCell
                  amount={f?.recruiterAmount ?? null}
                  currency={currency}
                />
              ) : null}
              {shown("lead") ? (
                <td className="px-3 py-2.5 text-xs text-fg-2">{leadLabel(j)}</td>
              ) : null}
              {shown("lead_amount") ? (
                <MoneyCell amount={f?.leadAmount ?? null} currency={currency} />
              ) : null}
              {shown("talental_net") ? (
                <td className="px-3 py-2.5 font-mono text-xs font-medium tabular-nums text-fg-1">
                  {formatMoney(f?.talentalNet ?? null, currency)}
                </td>
              ) : null}
              {shown("created") ? (
                <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    year: "2-digit",
                  })}
                </td>
              ) : null}
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-fg-muted">
        {label}
      </div>
      <div
        className={
          "font-mono text-sm tabular-nums " +
          (accent ? "text-accent font-medium" : "text-fg-1")
        }
      >
        {value}
      </div>
    </div>
  );
}
