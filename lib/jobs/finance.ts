import type { JobRow } from "@/lib/hiring";

/**
 * Pure financial projections derived from a job row.
 *
 * Everything here is a forecast — no row data is mutated, no
 * placement event is considered. The numbers track exactly the
 * Sheets-tracker columns the user retired in commit 2a23772 (jobs-
 * list view) but now live in /finances.
 *
 * All amounts are in the job's `salary_currency`. We don't FX-
 * convert; cross-currency totals are aggregated by currency in the
 * consumer.
 */

export type JobFinance = {
  midpoint: number | null;
  feeAmount: number | null;
  retainerAmount: number | null;
  placementBalance: number | null;
  recruiterAmount: number | null;
  leadAmount: number | null;
  talentalNet: number | null;
  currency: string;
};

/**
 * Convert any salary frequency to an annual figure using the
 * standard conventions used elsewhere in the codebase:
 *   - annual × 1
 *   - monthly × 12
 *   - weekly × 52
 *   - hourly × 2080 (40h/wk × 52wks)
 */
export function annualizedSalary(
  midpoint: number,
  frequency: string | null,
): number {
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

export function deriveJobFinance(j: JobRow): JobFinance {
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
    feeAmount != null ? feeAmount - (retainerAmount ?? 0) : null;
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

/**
 * Locale-aware currency formatting. Falls back to plain
 * comma-separated number + currency code when Intl rejects the
 * currency (e.g. unsupported code).
 */
export function formatMoney(amount: number | null, currency: string): string {
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
