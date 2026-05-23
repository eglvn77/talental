import "server-only";

import { enrichCompany, type DfB2BCompanyEnriched } from "./client";
import { hiring } from "@/lib/hiring";

/**
 * Look up a company in hiring.companies; if missing, enrich it via
 * DataForB2B's /enrich/company and insert. Returns the company's id
 * (existing OR newly created).
 *
 * Dedup order (cheapest → most expensive):
 *   1. by dfb2b_id          — strongest signal, free DB lookup
 *   2. by linkedin_url      — common pre-existing case (manual entry)
 *   3. by normalized name   — fallback, also free
 *   4. (only if all 3 miss) → call /enrich/company  (1.5 credits)
 *
 * Pass `cache` to amortize repeated lookups within a single import
 * job (e.g. 25 candidates who all worked at Stripe → 1 enrichment,
 * not 25).
 */
export type CompanyUpsertCache = Map<string, string>;

export function newUpsertCache(): CompanyUpsertCache {
  return new Map();
}

export type CompanyHint = {
  /** Name as it appears in the candidate's experience. */
  name: string;
  /** DfB2B's company.id from the candidate enrich response, if any. */
  dfb2bId?: string;
  /** company.url from the candidate enrich response (LinkedIn URL). */
  linkedinUrl?: string;
  /** Optional fallback when we don't have a URL/id (rare). */
  preferredIdentifier?: string;
};

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

export async function upsertCompanyFromHint(
  workspaceId: string,
  hint: CompanyHint,
  cache: CompanyUpsertCache,
): Promise<{ companyId: string; created: boolean; skipped?: false } | { companyId: null; created: false; skipped: true; reason: string }> {
  const cacheKey = hint.dfb2bId
    ? `id:${hint.dfb2bId}`
    : hint.linkedinUrl
      ? `url:${hint.linkedinUrl.toLowerCase()}`
      : `name:${nameKey(hint.name)}`;

  const cached = cache.get(cacheKey);
  if (cached) return { companyId: cached, created: false };

  const db = await hiring();

  // ----- 1. Dedup by dfb2b_id (free DB lookup) -----
  if (hint.dfb2bId) {
    const { data } = await db
      .from("companies")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("dfb2b_id", hint.dfb2bId)
      .maybeSingle();
    if (data?.id) {
      cache.set(cacheKey, data.id as string);
      return { companyId: data.id as string, created: false };
    }
  }

  // ----- 2. Dedup by linkedin_url -----
  if (hint.linkedinUrl) {
    const { data } = await db
      .from("companies")
      .select("id, dfb2b_id")
      .eq("workspace_id", workspaceId)
      .eq("linkedin_url", hint.linkedinUrl)
      .maybeSingle();
    if (data?.id) {
      cache.set(cacheKey, data.id as string);
      // Best-effort: backfill dfb2b_id if we know it and the existing
      // row didn't have it. No await on the result; we don't want a
      // failed update to block the import.
      if (hint.dfb2bId && !data.dfb2b_id) {
        void db
          .from("companies")
          .update({ dfb2b_id: hint.dfb2bId })
          .eq("id", data.id);
      }
      return { companyId: data.id as string, created: false };
    }
  }

  // ----- 3. Dedup by normalized name -----
  if (hint.name) {
    const { data } = await db
      .from("companies")
      .select("id, dfb2b_id, linkedin_url")
      .eq("workspace_id", workspaceId)
      .ilike("name", hint.name.trim())
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      cache.set(cacheKey, data.id as string);
      // Backfill missing identifiers if we have them.
      const patch: Record<string, unknown> = {};
      if (hint.dfb2bId && !data.dfb2b_id) patch.dfb2b_id = hint.dfb2bId;
      if (hint.linkedinUrl && !data.linkedin_url) {
        patch.linkedin_url = hint.linkedinUrl;
      }
      if (Object.keys(patch).length > 0) {
        void db.from("companies").update(patch).eq("id", data.id);
      }
      return { companyId: data.id as string, created: false };
    }
  }

  // ----- 4. Enrich (costs 1.5 credits) -----
  // Pick the most specific identifier we have. Fall back to the bare
  // name — DfB2B treats it as a slug guess.
  const identifier =
    hint.dfb2bId ||
    hint.linkedinUrl ||
    hint.preferredIdentifier ||
    hint.name.trim().toLowerCase().replace(/\s+/g, "-");

  let enriched: DfB2BCompanyEnriched;
  try {
    const resp = await enrichCompany(identifier);
    enriched = resp.company;
  } catch (e) {
    // Don't block the candidate import on a company enrichment failure;
    // just record a minimal row so the candidate at least has a company
    // record to link to. We can re-enrich later.
    const { data: minimal, error: insErr } = await db
      .from("companies")
      .insert({
        workspace_id: workspaceId,
        name: hint.name,
        linkedin_url: hint.linkedinUrl ?? null,
      })
      .select("id")
      .single();
    if (insErr || !minimal) {
      return {
        companyId: null,
        created: false,
        skipped: true,
        reason: `Insert failed: ${insErr?.message ?? "unknown"}`,
      };
    }
    cache.set(cacheKey, minimal.id as string);
    return {
      companyId: minimal.id as string,
      created: true,
      // We DID create a row, but warn callers that the enrichment failed.
      // Encoded as a soft signal via the error string for now.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(typeof e === "object" && e !== null ? { _enrichError: (e as Error).message } as any : {}),
    };
  }

  const linkedinSlug = enriched.links?.linkedin
    ? enriched.links.linkedin
        .replace(/\/$/, "")
        .split("/")
        .pop()
    : null;

  // Derive domain from website if present.
  let domain: string | null = null;
  if (enriched.links?.website) {
    try {
      const u = new URL(
        enriched.links.website.startsWith("http")
          ? enriched.links.website
          : `https://${enriched.links.website}`,
      );
      domain = u.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      // ignore
    }
  }

  const hq = enriched.headquarters
    ? [enriched.headquarters.city, enriched.headquarters.region, enriched.headquarters.country]
        .filter(Boolean)
        .join(", ")
    : null;

  const sizeRange =
    enriched.size?.range_min && enriched.size?.range_max
      ? `${enriched.size.range_min}-${enriched.size.range_max}`
      : null;

  const { data: created, error: insErr } = await db
    .from("companies")
    .insert({
      workspace_id: workspaceId,
      name: enriched.name ?? hint.name,
      domain,
      website_url: enriched.links?.website ?? null,
      linkedin_url: enriched.links?.linkedin ?? hint.linkedinUrl ?? null,
      industry: enriched.industry ?? null,
      size_range: sizeRange,
      hq_location: hq,
      description: enriched.description ?? enriched.tagline ?? null,
      logo_url: enriched.logo_url ?? null,
      dfb2b_id: enriched.id ?? hint.dfb2bId ?? null,
      linkedin_id: linkedinSlug ?? null,
      employee_count: enriched.size?.employees ?? null,
      founded_year: enriched.founded_year ?? null,
      company_type: enriched.company_type ?? null,
      enriched_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insErr || !created) {
    return {
      companyId: null,
      created: false,
      skipped: true,
      reason: `Insert failed: ${insErr?.message ?? "unknown"}`,
    };
  }
  cache.set(cacheKey, created.id as string);
  return { companyId: created.id as string, created: true };
}
