import "server-only";

/**
 * Pure helper for domain-based company enrichment: domain
 * normalization. No DB / no network here so it stays trivially
 * testable; the orchestration (idempotency, persist, usage log) lives
 * in dataforb2b.ts.
 *
 * (This module used to also hold a Zod result schema + a synthesized
 * match-confidence heuristic for the /search/companies path. That path
 * was removed — domain enrichment now goes through /enrich/company by
 * slug with a domain-match guard — so only normalizeDomain remains.)
 */

/**
 * Normalize a domain for matching: strip protocol, leading www, any
 * path/query/fragment, and trailing slash; lowercase. Returns null for
 * input that isn't a plausible domain (no dot, or contains whitespace)
 * so callers can skip cleanly.
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
