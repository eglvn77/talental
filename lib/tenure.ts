import type { ParsedExperience } from "@/lib/resume-parse";

/**
 * Tenure analysis over a candidate's experience list.
 *
 * "By company, not by role" — three roles at Google (associate →
 * manager → senior) count as ONE tenure of (sum of months). This
 * surfaces the signal recruiters actually care about: how long does
 * this person stay at a place?
 *
 * Pure arithmetic; no AI. Company name match is exact (case+trim
 * normalized). If/when name drift becomes a problem ("Google" vs
 * "Alphabet" vs "Google Inc") we can layer a Gemini Flash pass on
 * top to canonicalize, but the math itself doesn't need an LLM.
 */

export type CompanyTenure = {
  company: string;
  /** Sum of months across all roles at this company. */
  months: number;
  /** Number of distinct roles at this company (promotions count). */
  roles: number;
  /** Earliest start_date string across roles (raw, for sort). */
  start?: string;
  /** Whether any role at this company is the candidate's current one. */
  is_current: boolean;
  /** First company_logo_url found across the matching roles. */
  logo_url?: string;
};

export type TenureSummary = {
  /** Companies sorted by months desc. */
  by_company: CompanyTenure[];
  /** Total months across all companies (sum). */
  total_months: number;
  /** Average months per distinct company. */
  avg_months: number;
  /** How many distinct companies. */
  company_count: number;
  /** True when at least one company has a non-zero months value —
   *  if the data is so sparse that we have no durations, the consumer
   *  should hide the whole summary block rather than show "0 meses". */
  has_durations: boolean;
};

/** Normalize a company name for grouping (exact match after this). */
function key(name: string): string {
  return name.trim().toLowerCase();
}

/** Derive months from start_date / end_date when duration_months is
 *  missing (PDF parses don't include it). Returns 0 if dates are
 *  unparseable.
 *
 *  Accepts YYYY, YYYY-MM, YYYY-MM-DD; end_date null/"" = today. */
function deriveMonths(start?: string, end?: string | null): number {
  if (!start) return 0;
  const s = parseDate(start);
  if (!s) return 0;
  const e = end ? parseDate(end) : new Date();
  if (!e) return 0;
  const months =
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(0, months);
}

function parseDate(raw: string): Date | null {
  // Year only: "2018"
  if (/^\d{4}$/.test(raw)) return new Date(Number(raw), 0, 1);
  // Year-month: "2018-04"
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }
  // Full ISO or fallback: let Date constructor try.
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function computeTenure(experiences: ParsedExperience[]): TenureSummary {
  const buckets = new Map<string, CompanyTenure>();

  for (const e of experiences) {
    if (!e.company) continue;
    const k = key(e.company);
    const months =
      typeof e.duration_months === "number" && e.duration_months > 0
        ? e.duration_months
        : deriveMonths(e.start_date, e.end_date);
    const existing = buckets.get(k);
    if (existing) {
      existing.months += months;
      existing.roles += 1;
      if (
        e.start_date &&
        (!existing.start || e.start_date < existing.start)
      ) {
        existing.start = e.start_date;
      }
      if (e.is_current) existing.is_current = true;
      if (!existing.logo_url && e.company_logo_url) {
        existing.logo_url = e.company_logo_url;
      }
    } else {
      buckets.set(k, {
        company: e.company,
        months,
        roles: 1,
        start: e.start_date,
        is_current: Boolean(e.is_current),
        logo_url: e.company_logo_url,
      });
    }
  }

  const by_company = Array.from(buckets.values()).sort(
    (a, b) => b.months - a.months,
  );
  const total_months = by_company.reduce((acc, c) => acc + c.months, 0);
  const company_count = by_company.length;
  const avg_months =
    company_count > 0 ? Math.round(total_months / company_count) : 0;
  const has_durations = by_company.some((c) => c.months > 0);

  return {
    by_company,
    total_months,
    avg_months,
    company_count,
    has_durations,
  };
}

/** Human-readable months → "2 años 3 meses", "11 meses", "1 año". */
export function formatMonths(m: number): string {
  if (m <= 0) return "—";
  const years = Math.floor(m / 12);
  const months = m % 12;
  const yearStr = years === 1 ? "1 año" : years > 1 ? `${years} años` : "";
  const monthStr =
    months === 1 ? "1 mes" : months > 1 ? `${months} meses` : "";
  return [yearStr, monthStr].filter(Boolean).join(" ");
}
