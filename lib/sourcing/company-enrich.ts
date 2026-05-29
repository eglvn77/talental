import "server-only";
import { z } from "zod";

/**
 * Pure helpers for domain-based company enrichment: domain
 * normalization, Zod validation of the /search/companies result, and
 * the synthesized match-confidence heuristic.
 *
 * No DB / no network here — the orchestration (idempotency, persist,
 * usage log) lives in dataforb2b.ts so this file stays trivially
 * testable.
 *
 * IMPORTANT: DataForB2B does NOT return a relevance/confidence score.
 * `computeConfidence` is our own heuristic over exact-domain matches.
 */

/**
 * Normalize a domain for the /search/companies `domain =` filter:
 * strip protocol, leading www, any path/query/fragment, and trailing
 * slash; lowercase. Returns null for input that isn't a plausible
 * domain (no dot, or contains whitespace) so callers can skip cleanly.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  // Drop path / query / fragment — keep the host only.
  s = s.split("/")[0].split("?")[0].split("#")[0];
  s = s.replace(/\/+$/, "").trim();
  if (!s.includes(".") || /\s/.test(s)) return null;
  return s;
}

/**
 * Coerce a maybe-numeric value (DfB2B sometimes returns numbers as
 * strings) to a number, keeping null/empty as null. `.catch(null)`
 * guarantees a bad value never fails the whole parse / drops the row.
 */
const numish = z
  .preprocess(
    (v) => (v === null || v === undefined || v === "" ? null : Number(v)),
    z.number().nullable(),
  )
  .catch(null);

const strish = z
  .preprocess(
    (v) => (typeof v === "string" ? v : v == null ? null : String(v)),
    z.string().nullable(),
  )
  .catch(null);

/**
 * Tolerant schema for a single /search/companies result. Every field
 * uses `.catch()` so a single odd value never drops the whole company
 * (a dropped row would turn a real match into a false no_match). The
 * full object is still stored in raw_response via `.passthrough()`.
 */
export const CompanySearchResultSchema = z
  .object({
    id: strish,
    name: strish,
    domain: strish,
    universal_name: strish,
    industry: strish,
    company_type: strish,
    founded_year: numish,
    size: z
      .object({ employees: numish })
      .passthrough()
      .nullable()
      .catch(null),
    headquarters: z
      .object({ city: strish, country: strish })
      .passthrough()
      .nullable()
      .catch(null),
    growth: z
      .object({ percent_6m: numish })
      .passthrough()
      .nullable()
      .catch(null),
    funding: z
      .object({ stage: strish, total_usd: numish })
      .passthrough()
      .nullable()
      .catch(null),
    // categories can be string[] or { name }[] — normalized by helper.
    categories: z.array(z.unknown()).nullable().catch(null),
    investors: z.array(z.unknown()).nullable().catch(null),
  })
  .passthrough();

export type CompanySearchResult = z.infer<typeof CompanySearchResultSchema>;

/** Parse + validate raw results; drops anything that fails the schema
 *  (rather than throwing the whole batch away). Returns the valid set. */
export function parseCompanyResults(
  raw: Array<Record<string, unknown>>,
): CompanySearchResult[] {
  const out: CompanySearchResult[] = [];
  for (const r of raw) {
    const parsed = CompanySearchResultSchema.safeParse(r);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** First category as a plain string ("Software" or {name:"Software"}). */
export function firstCategory(
  categories: CompanySearchResult["categories"],
): string | null {
  if (!categories || categories.length === 0) return null;
  const c = categories[0];
  if (typeof c === "string") return c.trim() || null;
  if (c && typeof c === "object" && "name" in c) {
    const n = (c as { name?: unknown }).name;
    return typeof n === "string" ? n.trim() || null : null;
  }
  return null;
}

export type ConfidenceOutcome = {
  status: "enriched" | "low_confidence" | "no_match";
  confidence: number;
  /** The chosen best match (null on no_match). */
  best: CompanySearchResult | null;
  /** Runner-ups kept for manual review (low_confidence). */
  alternatives: CompanySearchResult[];
};

/**
 * Synthesized confidence over the /search/companies results.
 *
 * We already filtered server-side with `domain =`, so any result the
 * API returned IS a domain match — we do NOT re-filter on the result's
 * own `domain` field (it may be null/formatted differently/named
 * differently, which would wrongly drop a real match and surface a
 * false no_match). Confidence is therefore based on result COUNT:
 *   - 0 results          → no_match (confidence 0)
 *   - exactly 1 result   → confidence 1.0
 *   - 2+ results         → ambiguous, confidence 0.5; all kept as
 *                          alternatives for manual disambiguation
 *
 * As a tiny refinement, if a result's domain DOES exactly match the
 * requested one we prefer it as `best` (handles the rare case where
 * the API returns a couple of near-matches and one is exact).
 */
export function computeConfidence(
  requestedDomain: string,
  results: CompanySearchResult[],
  threshold: number,
): ConfidenceOutcome {
  if (results.length === 0) {
    return { status: "no_match", confidence: 0, best: null, alternatives: [] };
  }
  // Prefer an exact-domain result as the best pick, else the first.
  const exactIdx = results.findIndex(
    (r) => normalizeDomain(r.domain) === requestedDomain,
  );
  const best = exactIdx >= 0 ? results[exactIdx] : results[0];

  if (results.length === 1) {
    const confidence = 1;
    return {
      status: confidence >= threshold ? "enriched" : "low_confidence",
      confidence,
      best,
      alternatives: confidence >= threshold ? [] : results,
    };
  }
  // Multiple companies came back for this domain filter — ambiguous.
  const confidence = 0.5;
  return {
    status: confidence >= threshold ? "enriched" : "low_confidence",
    confidence,
    best,
    alternatives: results,
  };
}
