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
 * Lenient schema for a single /search/companies result. We validate
 * the subset we materialize; `.passthrough()` keeps the rest so the
 * full object can still be stored in raw_response. Every field is
 * optional/nullable because the API omits what it doesn't have.
 */
export const CompanySearchResultSchema = z
  .object({
    id: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    domain: z.string().optional().nullable(),
    universal_name: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    company_type: z.string().optional().nullable(),
    founded_year: z.number().int().optional().nullable(),
    size: z
      .object({ employees: z.number().optional().nullable() })
      .passthrough()
      .optional()
      .nullable(),
    headquarters: z
      .object({
        city: z.string().optional().nullable(),
        country: z.string().optional().nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
    growth: z
      .object({ percent_6m: z.number().optional().nullable() })
      .passthrough()
      .optional()
      .nullable(),
    funding: z
      .object({
        stage: z.string().optional().nullable(),
        total_usd: z.number().optional().nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
    // categories can be string[] or { name }[] — normalized by helper.
    categories: z.array(z.unknown()).optional().nullable(),
    investors: z.array(z.unknown()).optional().nullable(),
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
 * Synthesized confidence over exact-domain matches. We searched with
 * `domain =`, so any result whose normalized domain equals the
 * requested one is an exact match:
 *   - 0 exact matches            → no_match (confidence 0)
 *   - exactly 1 exact match      → confidence 1.0
 *   - 2+ exact matches (ambiguous duplicate data) → confidence 0.5,
 *     all kept as alternatives for manual disambiguation
 *
 * The caller compares `confidence` to its threshold to decide whether
 * to materialize (enriched) or flag (low_confidence).
 */
export function computeConfidence(
  requestedDomain: string,
  results: CompanySearchResult[],
  threshold: number,
): ConfidenceOutcome {
  const exact = results.filter(
    (r) => normalizeDomain(r.domain) === requestedDomain,
  );
  if (exact.length === 0) {
    return { status: "no_match", confidence: 0, best: null, alternatives: [] };
  }
  if (exact.length === 1) {
    const confidence = 1;
    return {
      status: confidence >= threshold ? "enriched" : "low_confidence",
      confidence,
      best: exact[0],
      alternatives: confidence >= threshold ? [] : exact,
    };
  }
  // Ambiguous: multiple companies share this exact domain in DfB2B.
  const confidence = 0.5;
  return {
    status: confidence >= threshold ? "enriched" : "low_confidence",
    confidence,
    best: exact[0],
    alternatives: exact,
  };
}
