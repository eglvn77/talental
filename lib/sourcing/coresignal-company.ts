import "server-only";

import { hiring, getRequestWorkspaceId } from "@/lib/hiring/clients";
import { getCurrentUser } from "@/lib/auth/session";
import {
  enrichCompanyByDomainRaw,
  type CoresignalCompany,
} from "./_internal/coresignal-company-raw";

/**
 * Public, cache-first wrapper around Coresignal's Clean Company API.
 *
 * Flow:
 *   1. Load the company's domain.
 *   2. If `enriched_at` is fresh AND was the Coresignal source →
 *      skip the API call.
 *   3. Otherwise call Coresignal (search by website → collect by id),
 *      map to the typed `companies` columns, persist.
 *   4. Log the call in hiring.api_usage_log.
 */

const FRESH_DAYS = 180; // company firmographics drift slowly — half-year is fine

export type CompanyEnrichResult =
  | {
      ok: true;
      status: "enriched" | "cached" | "no_match";
      matchConfidence: number | null;
    }
  | { ok: false; error: string };

export async function enrichCompanyFromCoresignal(
  companyId: string,
  opts: { force?: boolean } = {},
): Promise<CompanyEnrichResult> {
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  const { data: comp, error } = await db
    .from("companies")
    .select(
      "id, workspace_id, name, domain, website_url, linkedin_url, enriched_at, enrichment_source, enrichment_status",
    )
    .eq("id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (!comp) return { ok: false, error: "Company not found" };
  if (comp.workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace company" };
  }
  const domain = (comp.domain as string | null)?.trim() ?? "";
  if (!domain) {
    return { ok: false, error: "Company has no domain" };
  }

  // Cache hit: already enriched via Coresignal recently.
  if (
    !opts.force &&
    comp.enriched_at &&
    comp.enrichment_source === "coresignal" &&
    comp.enrichment_status === "enriched" &&
    isFresh(comp.enriched_at as string, FRESH_DAYS)
  ) {
    return { ok: true, status: "cached", matchConfidence: null };
  }

  const t0 = Date.now();
  const res = await enrichCompanyByDomainRaw(domain);
  const ms = Date.now() - t0;

  if (!res.ok) {
    await logUsage({
      workspaceId,
      companyId,
      domain,
      status: res.status,
      ok: false,
      error: res.error,
      responseTimeMs: ms,
    });
    // Persist failure so we don't hammer the API on re-clicks.
    const failureStatus = res.status === 404 ? "no_match" : `err_${res.status}`;
    await db
      .from("companies")
      .update({
        enrichment_source: "coresignal",
        enrichment_status: failureStatus,
        enriched_at: new Date().toISOString(),
      })
      .eq("id", companyId);
    return res.status === 404
      ? { ok: true, status: "no_match", matchConfidence: null }
      : { ok: false, error: res.error };
  }

  const mapped = mapCompany(res.data);
  await db
    .from("companies")
    .update({
      ...mapped,
      enrichment_source: "coresignal",
      enrichment_status: "enriched",
      enriched_at: new Date().toISOString(),
    })
    .eq("id", companyId);

  await logUsage({
    workspaceId,
    companyId,
    domain,
    status: 200,
    ok: true,
    responseTimeMs: ms,
  });
  return { ok: true, status: "enriched", matchConfidence: 1 };
}

// ── Mapping ─────────────────────────────────────────────────────────

function mapCompany(c: CoresignalCompany): Record<string, unknown> {
  const founded =
    typeof c.founded_year === "number"
      ? c.founded_year
      : typeof c.founded === "number"
        ? c.founded
        : c.founded != null
          ? Number(String(c.founded).slice(0, 4))
          : null;

  return {
    // Don't overwrite name — the recruiter typed it and likely
    // prefers their phrasing ("IPSY" not "Ipsy Inc"). Coresignal's
    // name lands only when ours is blank.
    industry: c.industry?.trim() || null,
    size_range: c.size?.trim() || null,
    employee_count:
      typeof c.employees_count === "number" ? c.employees_count : null,
    founded_year: founded && founded > 1800 && founded < 2100 ? founded : null,
    hq_city: c.hq_city?.trim() || null,
    hq_country: (c.hq_country_parsed ?? c.hq_country)?.trim() || null,
    description: c.description?.trim() || null,
    logo_url: c.logo_url?.trim() || null,
    company_type: (c.type ?? c.company_type)?.trim() || null,
    linkedin_url: c.linkedin_url?.trim() || null,
    total_funding_usd:
      typeof c.funding_total_amount === "number"
        ? c.funding_total_amount
        : null,
    funding_stage: c.funding_last_round_type?.trim() || null,
    website_url:
      c.website?.trim() ||
      (c.website ? `https://${c.website}` : null) ||
      null,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function isFresh(iso: string, ttlDays: number): boolean {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ttlDays * 24 * 60 * 60 * 1000;
}

async function logUsage(args: {
  workspaceId: string;
  companyId: string;
  domain: string;
  status: number;
  ok: boolean;
  error?: string;
  responseTimeMs: number;
}): Promise<void> {
  try {
    const db = await hiring();
    let userId: string | null = null;
    try {
      const me = await getCurrentUser();
      userId = me?.team_member?.id ?? null;
    } catch {
      /* webhook / cron context */
    }
    await db.from("api_usage_log").insert({
      workspace_id: args.workspaceId,
      user_id: userId,
      operation_type: "coresignal_company_clean_enrich",
      resource_external_id: args.domain,
      resource_internal_id: args.companyId,
      // 2 calls: 1 search (cached or live ≈ 0.75-1.5) + 1 collect (1).
      credits_used: args.ok ? 2 : 0,
      cache_hit: false,
      api_response_status: args.status,
      api_response_time_ms: args.responseTimeMs,
      error_message: args.error ? args.error.slice(0, 1000) : null,
    });
  } catch {
    /* logging failures never fatal */
  }
}
