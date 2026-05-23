"use client";

import { useMemo } from "react";
import Link from "next/link";
import { type CompanyRow, type JobRow } from "@/lib/hiring";
import { JOB_STATUS_LABEL, JOB_STATUS_VALUES } from "@/lib/job-status";
import {
  ColumnVisibilityMenu,
  DataTable,
  FilterSection,
  FiltersPopover,
  formatRelative,
  SortHeader,
  TableFilterBar,
  TableSearch,
  useLocalColumns,
  useLocalSet,
  useLocalSort,
  useLocalString,
  useTextFilter,
} from "../_components/table-controls";
import { JobStatusSelect } from "./status-select";
import { JobRowActions } from "./job-row-actions";
import { CompanyLogo } from "@/components/company-logo";

type SortKey =
  | "title"
  | "client"
  | "status"
  | "candidates"
  | "midpoint"
  | "fee_amount"
  | "created";
type ColKey =
  | "client"
  | "status"
  | "candidates"
  | "created"
  // Commercial-terms columns. These replace the external Sheets tracker;
  // they default-hide a few of the deeper ones to keep the table calm,
  // but the column-visibility menu surfaces the full financial breakdown
  // one click away.
  | "billing"
  | "midpoint"
  | "fee_months"
  | "fee_amount"
  | "retainer_amount"
  | "placement_balance"
  | "recruiter_amount"
  | "lead_amount"
  | "talental_net";

const COLUMNS: ReadonlyArray<{ key: ColKey; label: string }> = [
  { key: "client", label: "Empresa" },
  { key: "status", label: "Estado" },
  { key: "candidates", label: "Candidatos" },
  { key: "billing", label: "Factura" },
  { key: "midpoint", label: "Midpoint" },
  { key: "fee_months", label: "Fee (meses)" },
  { key: "fee_amount", label: "Fee total" },
  { key: "retainer_amount", label: "Anticipo" },
  { key: "placement_balance", label: "Saldo placement" },
  { key: "recruiter_amount", label: "Recruiter" },
  { key: "lead_amount", label: "Lead" },
  { key: "talental_net", label: "Profit Talental" },
  { key: "created", label: "Creada" },
];

// Default-hide the deeper financial columns. The user opts in via the
// column-visibility menu when they're running a P&L on the workspace.
const INITIAL_HIDDEN: ReadonlyArray<ColKey> = [
  "fee_months",
  "retainer_amount",
  "placement_balance",
  "recruiter_amount",
  "lead_amount",
  "talental_net",
];

// =============================================================
// Per-row financial projections — pure functions, no React state.
// =============================================================

function annualizedSalary(midpoint: number, frequency: string | null): number {
  switch (frequency) {
    case "annual":
      return midpoint;
    case "monthly":
      return midpoint * 12;
    case "weekly":
      return midpoint * 52;
    case "hourly":
      return midpoint * 2080;
    default:
      return midpoint;
  }
}

type JobFinance = {
  midpoint: number | null;
  feeAmount: number | null;
  retainerAmount: number | null;
  placementBalance: number | null;
  recruiterAmount: number | null;
  leadAmount: number | null;
  talentalNet: number | null;
  currency: string;
};

function deriveFinance(j: JobRow): JobFinance {
  const currency = j.salary_currency ?? "MXN";
  const midpoint =
    j.salary_min != null && j.salary_max != null
      ? (Number(j.salary_min) + Number(j.salary_max)) / 2
      : null;
  const feeAmount =
    midpoint != null && j.fee_pct != null
      ? (annualizedSalary(midpoint, j.salary_frequency) * Number(j.fee_pct)) /
        100
      : null;
  const isRetained = j.fee_model === "retained";
  const retainerAmount =
    isRetained && feeAmount != null && j.retainer_pct != null
      ? (feeAmount * Number(j.retainer_pct)) / 100
      : null;
  const placementBalance =
    feeAmount != null
      ? feeAmount - (retainerAmount ?? 0)
      : null;
  const recruiterAmount =
    feeAmount != null && j.recruiter_split_pct != null
      ? (feeAmount * Number(j.recruiter_split_pct)) / 100
      : null;
  const leadAmount =
    feeAmount != null && j.lead_split_pct != null
      ? (feeAmount * Number(j.lead_split_pct)) / 100
      : null;
  const talentalNet =
    feeAmount != null
      ? feeAmount - (recruiterAmount ?? 0) - (leadAmount ?? 0)
      : null;
  return {
    midpoint,
    feeAmount,
    retainerAmount,
    placementBalance,
    recruiterAmount,
    leadAmount,
    talentalNet,
    currency,
  };
}

function formatMoney(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString("en-US")} ${currency}`;
  }
}

function MoneyCell({ amount, currency }: { amount: number | null; currency: string }) {
  return (
    <td className="px-4 py-3 font-mono text-xs tabular-nums text-fg-2">
      {formatMoney(amount, currency)}
    </td>
  );
}

const BILLING_LABEL: Record<string, string> = {
  invoice: "Invoice",
  factura: "Factura",
};

export function JobsTable({
  jobs,
  companiesById,
  candidateCounts,
}: {
  jobs: JobRow[];
  companiesById: Record<string, CompanyRow>;
  candidateCounts: Record<string, number>;
}) {
  // Default Estado filter shows only "activa" — recruiters almost
  // always work the open pipeline first.
  const [statusFilter, setStatusFilter, resetStatusFilter] = useLocalSet(
    "jobs.filter.status",
    ["activa"],
  );
  const [clientFilter, setClientFilter, resetClientFilter] = useLocalSet(
    "jobs.filter.client",
  );
  const [query, setQuery] = useLocalString("jobs.filter.q");
  const [sort, toggleSort] = useLocalSort<SortKey>(
    "jobs.sort",
    { key: "created", dir: "desc" },
    ["title", "client", "status"],
  );
  const [hiddenCols, setHiddenCols, resetCols] = useLocalColumns<ColKey>(
    "jobs.cols",
    INITIAL_HIDDEN,
  );
  function resetFilters() {
    resetStatusFilter();
    resetClientFilter();
  }
  const shown = (k: ColKey) => !hiddenCols.has(k);
  const showClient = shown("client");
  const showStatus = shown("status");
  const showCandidates = shown("candidates");
  const showCreated = shown("created");
  const showBilling = shown("billing");
  const showMidpoint = shown("midpoint");
  const showFeeMonths = shown("fee_months");
  const showFeeAmount = shown("fee_amount");
  const showRetainerAmount = shown("retainer_amount");
  const showPlacementBalance = shown("placement_balance");
  const showRecruiterAmount = shown("recruiter_amount");
  const showLeadAmount = shown("lead_amount");
  const showTalentalNet = shown("talental_net");

  const visibleColCount =
    1 + // title (locked)
    (showClient ? 1 : 0) +
    (showStatus ? 1 : 0) +
    (showCandidates ? 1 : 0) +
    (showBilling ? 1 : 0) +
    (showMidpoint ? 1 : 0) +
    (showFeeMonths ? 1 : 0) +
    (showFeeAmount ? 1 : 0) +
    (showRetainerAmount ? 1 : 0) +
    (showPlacementBalance ? 1 : 0) +
    (showRecruiterAmount ? 1 : 0) +
    (showLeadAmount ? 1 : 0) +
    (showTalentalNet ? 1 : 0) +
    (showCreated ? 1 : 0) +
    1; // actions

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

  // Memoise per-row financial projections so sort + render don't
  // recompute the same numbers per pass.
  const financeByJobId = useMemo(() => {
    const m = new Map<string, JobFinance>();
    for (const j of jobs) m.set(j.id, deriveFinance(j));
    return m;
  }, [jobs]);

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
        cmp = (candidateCounts[a.id] ?? 0) - (candidateCounts[b.id] ?? 0);
      } else if (sort.key === "midpoint") {
        const am = financeByJobId.get(a.id)?.midpoint ?? -Infinity;
        const bm = financeByJobId.get(b.id)?.midpoint ?? -Infinity;
        cmp = am - bm;
      } else if (sort.key === "fee_amount") {
        const af = financeByJobId.get(a.id)?.feeAmount ?? -Infinity;
        const bf = financeByJobId.get(b.id)?.feeAmount ?? -Infinity;
        cmp = af - bf;
      } else {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort, companiesById, candidateCounts, financeByJobId]);

  return (
    <div className="space-y-3">
      <TableFilterBar shown={sorted.length} total={jobs.length}>
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder="Buscar por título o empresa…"
        />
        <FiltersPopover
          activeCount={statusFilter.size + clientFilter.size}
          onReset={resetFilters}
        >
          <FilterSection
            label="Estado"
            options={allStatuses.map((s) => ({
              value: s,
              label: JOB_STATUS_LABEL[s as keyof typeof JOB_STATUS_LABEL] ?? s,
            }))}
            selected={statusFilter}
            onChange={setStatusFilter}
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
              className="px-4 py-3 font-medium"
            />
            {showClient ? (
              <SortHeader
                label="Empresa"
                k="client"
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
            {showCandidates ? (
              <SortHeader
                label="Candidatos"
                k="candidates"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showBilling ? (
              <th className="px-4 py-3 text-left font-medium">Factura</th>
            ) : null}
            {showMidpoint ? (
              <SortHeader
                label="Midpoint"
                k="midpoint"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showFeeMonths ? (
              <th className="px-4 py-3 text-left font-medium">Meses</th>
            ) : null}
            {showFeeAmount ? (
              <SortHeader
                label="Fee total"
                k="fee_amount"
                state={sort}
                onToggle={toggleSort}
                className="px-4 py-3 font-medium"
              />
            ) : null}
            {showRetainerAmount ? (
              <th className="px-4 py-3 text-left font-medium">Anticipo</th>
            ) : null}
            {showPlacementBalance ? (
              <th className="px-4 py-3 text-left font-medium">Saldo</th>
            ) : null}
            {showRecruiterAmount ? (
              <th className="px-4 py-3 text-left font-medium">Recruiter</th>
            ) : null}
            {showLeadAmount ? (
              <th className="px-4 py-3 text-left font-medium">Lead</th>
            ) : null}
            {showTalentalNet ? (
              <th className="px-4 py-3 text-left font-medium">Net Talental</th>
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
            <th className="w-10 px-4 py-3" aria-label="Acciones" />
          </>
        }
      >
        {sorted.map((j) => {
          const company = j.company_id ? companiesById[j.company_id] : null;
          const appCount = candidateCounts[j.id] ?? 0;
          const f = financeByJobId.get(j.id);
          const currency = f?.currency ?? "MXN";
          return (
            <tr key={j.id}>
              <td className="px-4 py-3 font-medium">
                <Link href={`/jobs/${j.id}`} className="hover:underline">
                  {j.title}
                </Link>
              </td>
              {showClient ? (
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
              {showStatus ? (
                <td className="px-4 py-3">
                  <JobStatusSelect jobId={j.id} current={j.status} />
                </td>
              ) : null}
              {showCandidates ? (
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {appCount}
                </td>
              ) : null}
              {showBilling ? (
                <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                  {j.billing_format ? BILLING_LABEL[j.billing_format] : "—"}
                </td>
              ) : null}
              {showMidpoint ? (
                <MoneyCell amount={f?.midpoint ?? null} currency={currency} />
              ) : null}
              {showFeeMonths ? (
                <td className="px-4 py-3 font-mono text-xs tabular-nums text-fg-2">
                  {j.fee_months != null ? `${Number(j.fee_months)}m` : "—"}
                </td>
              ) : null}
              {showFeeAmount ? (
                <MoneyCell amount={f?.feeAmount ?? null} currency={currency} />
              ) : null}
              {showRetainerAmount ? (
                <MoneyCell
                  amount={f?.retainerAmount ?? null}
                  currency={currency}
                />
              ) : null}
              {showPlacementBalance ? (
                <MoneyCell
                  amount={f?.placementBalance ?? null}
                  currency={currency}
                />
              ) : null}
              {showRecruiterAmount ? (
                <MoneyCell
                  amount={f?.recruiterAmount ?? null}
                  currency={currency}
                />
              ) : null}
              {showLeadAmount ? (
                <MoneyCell amount={f?.leadAmount ?? null} currency={currency} />
              ) : null}
              {showTalentalNet ? (
                <MoneyCell
                  amount={f?.talentalNet ?? null}
                  currency={currency}
                />
              ) : null}
              {showCreated ? (
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {formatRelative(
                    (j.open_date ? `${j.open_date}T00:00:00Z` : null) ??
                      j.published_at ??
                      j.created_at,
                  )}
                </td>
              ) : null}
              <td className="px-2 py-3 text-right">
                <JobRowActions
                  jobId={j.id}
                  title={j.title}
                  applicationCount={appCount}
                />
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
