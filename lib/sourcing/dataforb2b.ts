import "server-only";

import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import {
  enrichProfile as rawEnrichProfile,
  enrichCompany as rawEnrichCompany,
  searchLLM as rawSearchLLM,
  normalizeLinkedinUrl,
  type DfB2BEnrichResponse,
  type DfB2BCompanyEnriched,
} from "./_internal/raw-client";
import { toParsedProfile } from "./_internal/to-parsed-profile";
import { isStale, type DataType, ttlDaysFor } from "./freshness";
import type { ParsedProfile } from "@/lib/resume-parse";

/**
 * Cache-first wrapper over the DataForB2B API.
 *
 * Every public consumer of DfB2B MUST go through this module. The
 * raw HTTP client lives under ./_internal/raw-client.ts and is
 * documented as internal — direct calls bypass the cache and the
 * usage log.
 *
 * Flow for every read function:
 *   1. Resolve workspaceId + (optional) userId from the request.
 *   2. Look up cached row in Supabase.
 *   3. If found AND fresh (per-data-type TTL) → log cache hit, return.
 *   4. Otherwise call raw API.
 *   5. Persist response back to Supabase (upsert).
 *   6. Log the call in api_usage_log with credits_used.
 *   7. Return unified shape.
 *
 * Costs (from /enrich/profile + /enrich/company + /search/llm docs):
 *   - profile basic enrich:           1.5
 *   - profile + work_email opt-in:    +3
 *   - profile + personal_email opt-in: +1
 *   - profile + phone opt-in:         +10
 *   - company enrich:                 1.5
 *   - search llm cached per result:   0.75
 *   - search llm live per result:     1.5
 */

// ---- Public result shapes ------------------------------------------

export type CandidateLite = {
  id: string;
  workspace_id: string;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  linkedin_public_id: string | null;
  headline: string | null;
  summary: string | null;
  current_company_name: string | null;
  current_position: string | null;
  location: string | null;
  profile_picture_url: string | null;
  enriched_at: string | null;
  enrichment_status: string | null;
};

export type CompanyLite = {
  id: string;
  workspace_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  logo_url: string | null;
  description: string | null;
  size_range: string | null;
  employee_count: number | null;
  founded_year: number | null;
  hq_city: string | null;
  hq_country: string | null;
  funding_stage: string | null;
  total_funding_usd: number | null;
  linkedin_url: string | null;
  website_url: string | null;
  enriched_at: string | null;
  enrichment_status: string | null;
};

export type SourcingResult<T> = {
  data: T;
  cacheHit: boolean;
  creditsUsed: number;
  responseTimeMs?: number;
};

export type SourcingError = {
  ok: false;
  error: string;
};

export type GetCandidateInput = {
  email?: string;
  linkedinUrl?: string;
  linkedinPublicId?: string;
};

// ---- Internal: workspace + user resolution -------------------------

async function resolveContext(): Promise<{
  workspaceId: string;
  userId: string | null;
}> {
  const workspaceId = await getRequestWorkspaceId();
  let userId: string | null = null;
  try {
    const me = await getCurrentUser();
    userId = me?.id ?? null;
  } catch {
    // Action might run outside a request (cron etc.) — userId null OK.
  }
  return { workspaceId, userId };
}

// ---- Internal: api_usage_log writer --------------------------------

type LogInput = {
  workspaceId: string;
  userId?: string | null;
  operationType:
    | "profile_search"
    | "profile_match"
    | "profile_live"
    | "profile_enrich_email"
    | "profile_enrich_personal_email"
    | "profile_enrich_phone"
    | "company_search"
    | "company_enrich"
    | "account";
  resourceExternalId?: string | null;
  resourceInternalId?: string | null;
  creditsUsed: number;
  cacheHit: boolean;
  apiResponseStatus?: number | null;
  apiResponseTimeMs?: number | null;
};

async function logUsage(input: LogInput): Promise<void> {
  const db = await hiring();
  await db.from("api_usage_log").insert({
    workspace_id: input.workspaceId,
    operation_type: input.operationType,
    resource_external_id: input.resourceExternalId ?? null,
    resource_internal_id: input.resourceInternalId ?? null,
    credits_used: input.creditsUsed,
    cache_hit: input.cacheHit,
    api_response_status: input.apiResponseStatus ?? null,
    api_response_time_ms: input.apiResponseTimeMs ?? null,
    user_id: input.userId ?? null,
  });
}

// ---- Internal: persistence helpers ---------------------------------

function nextRefreshAfter(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/**
 * Persist an enriched candidate profile to hiring.candidates. Upserts
 * by (workspace_id, linkedin_url) when present, otherwise by
 * (workspace_id, email). Populates denormalized columns + keeps
 * parsed_profile jsonb as the read-path source for the slideover.
 *
 * Returns the upserted row's id + whether it was newly created.
 */
async function persistCandidate(input: {
  workspaceId: string;
  enriched: DfB2BEnrichResponse;
  linkedinUrl: string | null;
  source: string;
  /**
   * Team member that triggered the enrichment. Stamped on first
   * insert so recruiters can see candidates they personally added
   * via LinkedIn (Q1 option C in the team-access model). Ignored
   * on updates so we don't reassign ownership when re-enriching.
   */
  createdByTeamMemberId?: string | null;
}): Promise<{ id: string; created: boolean; row: CandidateLite }> {
  const db = await hiring();
  const parsed = toParsedProfile(input.enriched);
  const p = input.enriched.profile;

  const linkedinUrl =
    input.linkedinUrl ?? p.links?.linkedin ?? null;
  const linkedinPublicId = linkedinUrl
    ? extractLinkedinPublicId(linkedinUrl)
    : null;

  const fullName =
    parsed.full_name?.trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  if (!fullName) {
    throw new Error("Enriched profile has no name; cannot persist.");
  }

  const hq = p.location ?? null;
  const current = p.experience?.find((e) => e.is_current) ?? p.experience?.[0];

  // Sum experience months for years_of_experience.
  const totalMonths = (p.experience ?? []).reduce(
    (acc, e) => acc + (e.duration_months ?? 0),
    0,
  );
  const yearsOfExp = totalMonths > 0 ? Math.floor(totalMonths / 12) : null;

  const candidatePayload = {
    workspace_id: input.workspaceId,
    full_name: fullName.slice(0, 200),
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    email:
      (input.enriched.work_email ?? input.enriched.personal_email ?? null)
        ?.toLowerCase() ?? null,
    phone: input.enriched.phone ?? null,
    linkedin_url: linkedinUrl,
    linkedin_public_id: linkedinPublicId,
    headline: p.headline ?? null,
    summary: p.summary ?? null,
    location: hq,
    country: p.country ?? null,
    city: null, // The API returns location as a single string; we don't split.
    profile_picture_url: p.profile_picture_url ?? null,
    current_company_name: current?.company?.name ?? null,
    current_position: current?.title ?? null,
    years_of_experience: yearsOfExp,
    default_source: "linkedin" as const,
    parsed_profile: parsed,
    enriched_at: new Date().toISOString(),
    enrichment_source: input.source,
    enrichment_status: "success",
    next_refresh_at: nextRefreshAfter(ttlDaysFor("profile_full")),
    needs_embedding: true,
  };

  // Try to find an existing row to update (workspace-scoped).
  let existingId: string | null = null;
  if (linkedinUrl) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("linkedin_url", linkedinUrl)
      .maybeSingle();
    existingId = (data?.id as string | undefined) ?? null;
  }
  if (!existingId && candidatePayload.email) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("email", candidatePayload.email)
      .maybeSingle();
    existingId = (data?.id as string | undefined) ?? null;
  }

  if (existingId) {
    const { data, error } = await db
      .from("candidates")
      .update(candidatePayload)
      .eq("id", existingId)
      .select(SELECT_CANDIDATE_LITE)
      .single();
    if (error || !data) throw new Error(error?.message ?? "Update failed");
    return { id: existingId, created: false, row: data as CandidateLite };
  }

  const { data, error } = await db
    .from("candidates")
    .insert({
      ...candidatePayload,
      created_by_team_member_id: input.createdByTeamMemberId ?? null,
    })
    .select(SELECT_CANDIDATE_LITE)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed");
  return { id: data.id as string, created: true, row: data as CandidateLite };
}

async function persistCompany(input: {
  workspaceId: string;
  enriched: DfB2BCompanyEnriched;
  hintName?: string;
  hintLinkedinUrl?: string;
  source: string;
}): Promise<{ id: string; created: boolean; row: CompanyLite }> {
  const db = await hiring();
  const c = input.enriched;

  let domain: string | null = null;
  if (c.links?.website) {
    try {
      const u = new URL(
        c.links.website.startsWith("http")
          ? c.links.website
          : `https://${c.links.website}`,
      );
      domain = u.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      // ignore
    }
  }

  const linkedinUrl = c.links?.linkedin ?? input.hintLinkedinUrl ?? null;
  const linkedinSlug = linkedinUrl
    ? linkedinUrl.replace(/\/$/, "").split("/").pop()
    : null;
  const sizeRange =
    c.size?.range_min && c.size?.range_max
      ? `${c.size.range_min}-${c.size.range_max}`
      : null;

  const payload = {
    workspace_id: input.workspaceId,
    name: c.name ?? input.hintName ?? "Unknown",
    domain,
    website_url: c.links?.website ?? null,
    linkedin_url: linkedinUrl,
    linkedin_id: linkedinSlug ?? null,
    dfb2b_id: c.id ?? null,
    industry: c.industry ?? null,
    size_range: sizeRange,
    employee_count: c.size?.employees ?? null,
    founded_year: c.founded_year ?? null,
    company_type: c.company_type ?? null,
    description: c.description ?? c.tagline ?? null,
    logo_url: c.logo_url ?? null,
    hq_location: [c.headquarters?.city, c.headquarters?.region, c.headquarters?.country]
      .filter(Boolean)
      .join(", ") || null,
    hq_city: c.headquarters?.city ?? null,
    hq_country: c.headquarters?.country ?? null,
    enriched_at: new Date().toISOString(),
    enrichment_source: input.source,
    enrichment_status: "success",
    next_refresh_at: nextRefreshAfter(ttlDaysFor("company_firmographics")),
    needs_embedding: true,
  };

  // Dedup order: dfb2b_id → linkedin_url → domain → exact name.
  let existingId: string | null = null;
  if (c.id) {
    const { data } = await db
      .from("companies")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("dfb2b_id", c.id)
      .maybeSingle();
    existingId = (data?.id as string | undefined) ?? null;
  }
  if (!existingId && linkedinUrl) {
    const { data } = await db
      .from("companies")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("linkedin_url", linkedinUrl)
      .maybeSingle();
    existingId = (data?.id as string | undefined) ?? null;
  }
  if (!existingId && domain) {
    const { data } = await db
      .from("companies")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("domain", domain)
      .maybeSingle();
    existingId = (data?.id as string | undefined) ?? null;
  }
  if (!existingId && payload.name) {
    const { data } = await db
      .from("companies")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .ilike("name", payload.name)
      .maybeSingle();
    existingId = (data?.id as string | undefined) ?? null;
  }

  if (existingId) {
    const { data, error } = await db
      .from("companies")
      .update(payload)
      .eq("id", existingId)
      .select(SELECT_COMPANY_LITE)
      .single();
    if (error || !data) throw new Error(error?.message ?? "Update failed");
    return { id: existingId, created: false, row: data as CompanyLite };
  }

  const { data, error } = await db
    .from("companies")
    .insert(payload)
    .select(SELECT_COMPANY_LITE)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed");
  return { id: data.id as string, created: true, row: data as CompanyLite };
}

const SELECT_CANDIDATE_LITE =
  "id, workspace_id, full_name, email, linkedin_url, linkedin_public_id, headline, summary, current_company_name, current_position, location, profile_picture_url, enriched_at, enrichment_status";

const SELECT_COMPANY_LITE =
  "id, workspace_id, name, domain, industry, logo_url, description, size_range, employee_count, founded_year, hq_city, hq_country, funding_stage, total_funding_usd, linkedin_url, website_url, enriched_at, enrichment_status";

function extractLinkedinPublicId(url: string): string | null {
  const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

// =====================================================================
// Public API — 6 cache-first functions
// =====================================================================

/**
 * Get a candidate by email / linkedin URL / linkedin public ID.
 * Returns cached row if fresh, otherwise calls /enrich/profile.
 *
 * `refreshIfOlderThanDays` overrides the per-data-type TTL. Pass a
 * smaller number to force a fresher copy (e.g. before generating an
 * AI summary for the slideover).
 */
export async function getCandidate(
  identifier: GetCandidateInput,
  options: {
    refreshIfOlderThanDays?: number;
    userId?: string;
    /**
     * Team-member id to stamp on the candidate row when it gets
     * created for the first time (Q1 team-access model). Resolves
     * via the auth-aware `requireCurrentTeamMember` in callers like
     * `enrichFromLinkedinAction`; pass undefined for system paths
     * that aren't user-attributable.
     */
    createdByTeamMemberId?: string | null;
  } = {},
): Promise<SourcingResult<CandidateLite>> {
  const ctx = await resolveContext();
  const userId = options.userId ?? ctx.userId;
  const db = await hiring();

  const linkedinUrl = identifier.linkedinUrl
    ? normalizeLinkedinUrl(identifier.linkedinUrl)
    : null;

  // ----- Cache lookup -----
  let existing: CandidateLite | null = null;
  if (linkedinUrl) {
    const { data } = await db
      .from("candidates")
      .select(SELECT_CANDIDATE_LITE)
      .eq("workspace_id", ctx.workspaceId)
      .eq("linkedin_url", linkedinUrl)
      .maybeSingle();
    existing = (data as CandidateLite | null) ?? null;
  }
  if (!existing && identifier.email) {
    const { data } = await db
      .from("candidates")
      .select(SELECT_CANDIDATE_LITE)
      .eq("workspace_id", ctx.workspaceId)
      .eq("email", identifier.email.toLowerCase())
      .maybeSingle();
    existing = (data as CandidateLite | null) ?? null;
  }
  if (!existing && identifier.linkedinPublicId) {
    const { data } = await db
      .from("candidates")
      .select(SELECT_CANDIDATE_LITE)
      .eq("workspace_id", ctx.workspaceId)
      .eq("linkedin_public_id", identifier.linkedinPublicId.toLowerCase())
      .maybeSingle();
    existing = (data as CandidateLite | null) ?? null;
  }

  const fresh =
    existing &&
    existing.enrichment_status === "success" &&
    !isStale(
      existing.enriched_at ? new Date(existing.enriched_at) : null,
      "profile_full",
      options.refreshIfOlderThanDays,
    );

  if (fresh && existing) {
    await logUsage({
      workspaceId: ctx.workspaceId,
      userId,
      operationType: "profile_match",
      resourceExternalId: existing.linkedin_public_id ?? existing.linkedin_url,
      resourceInternalId: existing.id,
      creditsUsed: 0,
      cacheHit: true,
    });
    return { data: existing, cacheHit: true, creditsUsed: 0 };
  }

  // ----- Cache miss: hit the API -----
  if (!linkedinUrl && !identifier.linkedinPublicId && !identifier.email) {
    throw new Error("getCandidate needs at least linkedinUrl, linkedinPublicId or email");
  }
  const identifierForApi =
    linkedinUrl ?? identifier.linkedinPublicId ?? identifier.email ?? "";

  const start = Date.now();
  let enriched: DfB2BEnrichResponse;
  let status = 0;
  try {
    enriched = await rawEnrichProfile(identifierForApi);
    status = 200;
  } catch (e) {
    status = 0;
    await logUsage({
      workspaceId: ctx.workspaceId,
      userId,
      operationType: "profile_live",
      resourceExternalId: identifierForApi,
      resourceInternalId: existing?.id ?? null,
      creditsUsed: 0,
      cacheHit: false,
      apiResponseStatus: status,
      apiResponseTimeMs: Date.now() - start,
    });
    throw e;
  }

  const persisted = await persistCandidate({
    workspaceId: ctx.workspaceId,
    enriched,
    linkedinUrl,
    source: "dataforb2b",
    createdByTeamMemberId: options.createdByTeamMemberId ?? null,
  });

  await logUsage({
    workspaceId: ctx.workspaceId,
    userId,
    operationType: "profile_live",
    resourceExternalId: identifierForApi,
    resourceInternalId: persisted.id,
    creditsUsed: 1.5,
    cacheHit: false,
    apiResponseStatus: status,
    apiResponseTimeMs: Date.now() - start,
  });

  return { data: persisted.row, cacheHit: false, creditsUsed: 1.5 };
}

/**
 * Enrich a candidate's email (work or personal). Skips the API call
 * if the candidate already has an email and was enriched within the
 * email TTL (90 days default).
 */
export async function enrichCandidateEmail(
  candidateId: string,
  options: { kind?: "work" | "personal"; userId?: string } = {},
): Promise<SourcingResult<{ email: string | null }>> {
  const ctx = await resolveContext();
  const userId = options.userId ?? ctx.userId;
  const kind = options.kind ?? "work";
  const dataType: DataType = kind === "work" ? "email_work" : "email_personal";
  const db = await hiring();

  const { data: cand, error: candErr } = await db
    .from("candidates")
    .select(
      "id, workspace_id, email, linkedin_url, linkedin_public_id, enriched_at",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (candErr || !cand) {
    return {
      data: { email: null },
      cacheHit: false,
      creditsUsed: 0,
    };
  }

  // Cache hit if we already have an email and the enrichment isn't stale.
  if (
    cand.email &&
    !isStale(cand.enriched_at ? new Date(cand.enriched_at) : null, dataType)
  ) {
    await logUsage({
      workspaceId: ctx.workspaceId,
      userId,
      operationType:
        kind === "work" ? "profile_enrich_email" : "profile_enrich_personal_email",
      resourceInternalId: cand.id as string,
      creditsUsed: 0,
      cacheHit: true,
    });
    return { data: { email: cand.email as string }, cacheHit: true, creditsUsed: 0 };
  }

  // Need an identifier to call the API.
  const identifier =
    (cand.linkedin_url as string | null) ?? (cand.linkedin_public_id as string | null);
  if (!identifier) {
    return { data: { email: null }, cacheHit: false, creditsUsed: 0 };
  }

  const start = Date.now();
  const enriched = await rawEnrichProfile(identifier, {
    enrich_work_email: kind === "work",
    enrich_personal_email: kind === "personal",
  });
  const newEmail =
    kind === "work"
      ? (enriched.work_email ?? null)
      : (enriched.personal_email ?? null);

  if (newEmail) {
    await db
      .from("candidates")
      .update({
        email: newEmail.toLowerCase(),
        enriched_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
  }

  const creditsUsed = kind === "work" ? 4.5 : 2.5; // 1.5 base + opt-in
  await logUsage({
    workspaceId: ctx.workspaceId,
    userId,
    operationType:
      kind === "work"
        ? "profile_enrich_email"
        : "profile_enrich_personal_email",
    resourceInternalId: cand.id as string,
    creditsUsed,
    cacheHit: false,
    apiResponseStatus: 200,
    apiResponseTimeMs: Date.now() - start,
  });

  return { data: { email: newEmail }, cacheHit: false, creditsUsed };
}

/**
 * Get a company by identifier (domain, LinkedIn URL, slug, or DfB2B
 * encoded ID). Returns cached row if fresh, otherwise calls
 * /enrich/company.
 */
export async function getCompany(
  identifier: string,
  options: {
    refreshIfOlderThanDays?: number;
    userId?: string;
    hintName?: string;
  } = {},
): Promise<SourcingResult<CompanyLite>> {
  const ctx = await resolveContext();
  const userId = options.userId ?? ctx.userId;
  const db = await hiring();

  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new Error("getCompany identifier cannot be empty");
  }

  // Best-effort: derive a domain from a URL for the cache lookup.
  let maybeDomain: string | null = null;
  try {
    if (/^https?:\/\//.test(trimmed)) {
      const u = new URL(trimmed);
      maybeDomain = u.hostname.toLowerCase().replace(/^www\./, "");
    } else if (/\./.test(trimmed) && !/linkedin\.com/.test(trimmed)) {
      maybeDomain = trimmed.toLowerCase().replace(/^www\./, "");
    }
  } catch {
    // ignore
  }
  const isLinkedinUrl = /linkedin\.com\/company\//.test(trimmed);
  const isDfB2BId = /^org_/.test(trimmed);

  // ----- Cache lookup -----
  let existing: CompanyLite | null = null;
  if (isDfB2BId) {
    const { data } = await db
      .from("companies")
      .select(SELECT_COMPANY_LITE)
      .eq("workspace_id", ctx.workspaceId)
      .eq("dfb2b_id", trimmed)
      .maybeSingle();
    existing = (data as CompanyLite | null) ?? null;
  }
  if (!existing && isLinkedinUrl) {
    const { data } = await db
      .from("companies")
      .select(SELECT_COMPANY_LITE)
      .eq("workspace_id", ctx.workspaceId)
      .eq("linkedin_url", trimmed)
      .maybeSingle();
    existing = (data as CompanyLite | null) ?? null;
  }
  if (!existing && maybeDomain) {
    const { data } = await db
      .from("companies")
      .select(SELECT_COMPANY_LITE)
      .eq("workspace_id", ctx.workspaceId)
      .eq("domain", maybeDomain)
      .maybeSingle();
    existing = (data as CompanyLite | null) ?? null;
  }
  // Last-resort name match.
  if (!existing && options.hintName) {
    const { data } = await db
      .from("companies")
      .select(SELECT_COMPANY_LITE)
      .eq("workspace_id", ctx.workspaceId)
      .ilike("name", options.hintName.trim())
      .maybeSingle();
    existing = (data as CompanyLite | null) ?? null;
  }

  const fresh =
    existing &&
    existing.enrichment_status === "success" &&
    !isStale(
      existing.enriched_at ? new Date(existing.enriched_at) : null,
      "company_firmographics",
      options.refreshIfOlderThanDays,
    );

  if (fresh && existing) {
    await logUsage({
      workspaceId: ctx.workspaceId,
      userId,
      operationType: "company_enrich",
      resourceExternalId: trimmed,
      resourceInternalId: existing.id,
      creditsUsed: 0,
      cacheHit: true,
    });
    return { data: existing, cacheHit: true, creditsUsed: 0 };
  }

  // ----- Cache miss -----
  const start = Date.now();
  let enriched: DfB2BCompanyEnriched;
  let status = 0;
  try {
    const resp = await rawEnrichCompany(trimmed);
    enriched = resp.company;
    status = 200;
  } catch (e) {
    await logUsage({
      workspaceId: ctx.workspaceId,
      userId,
      operationType: "company_enrich",
      resourceExternalId: trimmed,
      resourceInternalId: existing?.id ?? null,
      creditsUsed: 0,
      cacheHit: false,
      apiResponseStatus: 0,
      apiResponseTimeMs: Date.now() - start,
    });
    throw e;
  }

  const persisted = await persistCompany({
    workspaceId: ctx.workspaceId,
    enriched,
    hintName: options.hintName,
    hintLinkedinUrl: isLinkedinUrl ? trimmed : undefined,
    source: "dataforb2b",
  });

  await logUsage({
    workspaceId: ctx.workspaceId,
    userId,
    operationType: "company_enrich",
    resourceExternalId: trimmed,
    resourceInternalId: persisted.id,
    creditsUsed: 1.5,
    cacheHit: false,
    apiResponseStatus: status,
    apiResponseTimeMs: Date.now() - start,
  });

  return { data: persisted.row, cacheHit: false, creditsUsed: 1.5 };
}

/**
 * Re-enrich an existing company row regardless of freshness. Use when
 * the recruiter explicitly clicks "Refrescar" on the company panel,
 * or from the daily cron for active-pipeline companies.
 */
export async function enrichCompany(
  companyId: string,
  options: { userId?: string } = {},
): Promise<SourcingResult<CompanyLite>> {
  const ctx = await resolveContext();
  const userId = options.userId ?? ctx.userId;
  const db = await hiring();

  const { data: existing, error } = await db
    .from("companies")
    .select(
      "id, name, domain, linkedin_url, dfb2b_id, linkedin_id",
    )
    .eq("id", companyId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error("Company not found");
  }

  // Pick the strongest identifier we have to re-enrich.
  const identifier =
    (existing.dfb2b_id as string | null) ??
    (existing.linkedin_url as string | null) ??
    (existing.linkedin_id as string | null) ??
    (existing.domain as string | null) ??
    (existing.name as string);
  // Force-refresh by passing refreshIfOlderThanDays=0 indirectly:
  // we call the raw endpoint here, bypassing getCompany's cache logic.
  const start = Date.now();
  const resp = await rawEnrichCompany(identifier);
  const persisted = await persistCompany({
    workspaceId: ctx.workspaceId,
    enriched: resp.company,
    hintName: existing.name as string,
    hintLinkedinUrl: (existing.linkedin_url as string | null) ?? undefined,
    source: "dataforb2b",
  });
  await logUsage({
    workspaceId: ctx.workspaceId,
    userId,
    operationType: "company_enrich",
    resourceExternalId: identifier,
    resourceInternalId: persisted.id,
    creditsUsed: 1.5,
    cacheHit: false,
    apiResponseStatus: 200,
    apiResponseTimeMs: Date.now() - start,
  });

  return { data: persisted.row, cacheHit: false, creditsUsed: 1.5 };
}

/**
 * Fill-empty enrichment: pulls fresh data from DfB2B for an existing
 * `companies` row but only writes columns whose current value is
 * null/empty. Lets the recruiter hit "Enriquecer" without fear of
 * losing edits they made by hand.
 *
 * Unlike `enrichCompany()` (which overwrites everything via
 * `persistCompany`), this builds a narrow patch and tracks which
 * fields actually changed so the caller can surface a useful toast
 * ("Llenamos: industria, tamaño, LinkedIn").
 *
 * Always counts 1 API call (1.5 credits) — DfB2B has no "patch"
 * endpoint; we still pay for the full enrichment whether we keep
 * one field or twelve.
 */
export async function fillEmptyFromEnrichment(
  companyId: string,
  options: { userId?: string } = {},
): Promise<{
  filled: string[];
  skipped: string[];
  creditsUsed: number;
}> {
  const ctx = await resolveContext();
  const userId = options.userId ?? ctx.userId;
  const db = await hiring();

  const { data: existing, error } = await db
    .from("companies")
    .select(
      "id, name, domain, website_url, linkedin_url, linkedin_id, dfb2b_id, industry, size_range, employee_count, founded_year, company_type, description, logo_url, hq_location, hq_city, hq_country",
    )
    .eq("id", companyId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error("Company not found");
  }

  const identifier =
    (existing.dfb2b_id as string | null) ??
    (existing.linkedin_url as string | null) ??
    (existing.linkedin_id as string | null) ??
    (existing.domain as string | null) ??
    (existing.name as string);
  if (!identifier) {
    throw new Error(
      "La empresa no tiene dominio, LinkedIn o nombre para enriquecer.",
    );
  }

  const start = Date.now();
  let enriched: DfB2BCompanyEnriched;
  let status = 0;
  try {
    const resp = await rawEnrichCompany(identifier);
    enriched = resp.company;
    status = 200;
  } catch (e) {
    await logUsage({
      workspaceId: ctx.workspaceId,
      userId,
      operationType: "company_enrich",
      resourceExternalId: identifier,
      resourceInternalId: companyId,
      creditsUsed: 0,
      cacheHit: false,
      apiResponseStatus: 0,
      apiResponseTimeMs: Date.now() - start,
    });
    throw e;
  }

  // Build the candidate values DfB2B returned — same derivations as
  // persistCompany so behavior stays consistent between the
  // overwrite-style and fill-empty paths.
  const incomingWebsite = enriched.links?.website ?? null;
  let incomingDomain: string | null = null;
  if (incomingWebsite) {
    try {
      const u = new URL(
        incomingWebsite.startsWith("http")
          ? incomingWebsite
          : `https://${incomingWebsite}`,
      );
      incomingDomain = u.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      // ignore — leave null
    }
  }
  const incomingSizeRange =
    enriched.size?.range_min && enriched.size?.range_max
      ? `${enriched.size.range_min}-${enriched.size.range_max}`
      : null;
  const incomingHqLocation =
    [
      enriched.headquarters?.city,
      enriched.headquarters?.region,
      enriched.headquarters?.country,
    ]
      .filter(Boolean)
      .join(", ") || null;

  // Map column -> incoming value, then drop any whose current row
  // value is already filled (non-null, non-empty string). dfb2b_id
  // ALWAYS gets written when missing — it's an opaque cache key the
  // user can't have set themselves.
  const candidates: Record<string, unknown> = {
    dfb2b_id: enriched.id ?? null,
    industry: enriched.industry ?? null,
    size_range: incomingSizeRange,
    employee_count: enriched.size?.employees ?? null,
    founded_year: enriched.founded_year ?? null,
    company_type: enriched.company_type ?? null,
    description: enriched.description ?? enriched.tagline ?? null,
    logo_url: enriched.logo_url ?? null,
    linkedin_url: enriched.links?.linkedin ?? null,
    website_url: incomingWebsite,
    domain: incomingDomain,
    hq_location: incomingHqLocation,
    hq_city: enriched.headquarters?.city ?? null,
    hq_country: enriched.headquarters?.country ?? null,
  };

  const isFilled = (v: unknown) =>
    v !== null && v !== undefined && (typeof v !== "string" || v.trim() !== "");

  const patch: Record<string, unknown> = {};
  const filled: string[] = [];
  const skipped: string[] = [];
  for (const [col, incoming] of Object.entries(candidates)) {
    const current = (existing as Record<string, unknown>)[col];
    if (!isFilled(incoming)) continue; // no new data to apply
    if (isFilled(current)) {
      skipped.push(col);
      continue;
    }
    patch[col] = incoming;
    filled.push(col);
  }

  // Always mark the row as enriched so the next freshness check
  // doesn't loop us back in immediately.
  patch.enriched_at = new Date().toISOString();
  patch.enrichment_source = "dataforb2b";
  patch.enrichment_status = "success";
  patch.next_refresh_at = nextRefreshAfter(
    ttlDaysFor("company_firmographics"),
  );

  if (filled.length > 0) {
    const { error: updErr } = await db
      .from("companies")
      .update(patch)
      .eq("id", companyId);
    if (updErr) {
      await logUsage({
        workspaceId: ctx.workspaceId,
        userId,
        operationType: "company_enrich",
        resourceExternalId: identifier,
        resourceInternalId: companyId,
        creditsUsed: 1.5,
        cacheHit: false,
        apiResponseStatus: status,
        apiResponseTimeMs: Date.now() - start,
      });
      throw new Error(updErr.message.slice(0, 300));
    }
  }

  await logUsage({
    workspaceId: ctx.workspaceId,
    userId,
    operationType: "company_enrich",
    resourceExternalId: identifier,
    resourceInternalId: companyId,
    creditsUsed: 1.5,
    cacheHit: false,
    apiResponseStatus: status,
    apiResponseTimeMs: Date.now() - start,
  });

  return { filled, skipped, creditsUsed: 1.5 };
}

/**
 * Natural-language search for candidates. Cache lookup is exact-match
 * over a normalized query (lowercase + trim + sorted filters) UNTIL
 * Voyage embeddings are configured (then PASO 6 layers in semantic
 * cosine match >= 0.95).
 *
 * On cache miss, calls /search/llm with category="people".
 * `enrich_live: false` by default → 0.75 credits per result.
 */
export async function searchCandidatesNL(
  query: string,
  options: {
    filters?: Record<string, unknown>;
    count?: number;
    enrichLive?: boolean;
    userId?: string;
  } = {},
): Promise<
  SourcingResult<{ candidateIds: string[]; total: number }>
> {
  return searchNL("people", query, options);
}

/**
 * Natural-language search for companies. Same caching contract as
 * searchCandidatesNL.
 */
export async function searchCompanies(
  query: string,
  options: {
    filters?: Record<string, unknown>;
    count?: number;
    enrichLive?: boolean;
    userId?: string;
  } = {},
): Promise<
  SourcingResult<{ companyIds: string[]; total: number }>
> {
  // We use the same NL endpoint with category="company".
  // Return shape repacks candidateIds → companyIds for type safety.
  const res = await searchNL("company", query, options);
  return {
    ...res,
    data: { companyIds: res.data.candidateIds, total: res.data.total },
  };
}

async function searchNL(
  category: "people" | "company",
  query: string,
  options: {
    filters?: Record<string, unknown>;
    count?: number;
    enrichLive?: boolean;
    userId?: string;
  },
): Promise<SourcingResult<{ candidateIds: string[]; total: number }>> {
  const ctx = await resolveContext();
  const userId = options.userId ?? ctx.userId;
  const db = await hiring();

  const queryNormalized = normalizeQuery(query);
  const filtersKey = stableStringify(options.filters ?? {});
  const cacheLookupKey = `${category}|${queryNormalized}|${filtersKey}`;

  // ----- Cache lookup (exact-match path; semantic match comes in PASO 6) -----
  const { data: cacheHit } = await db
    .from("search_cache")
    .select("id, result_candidate_ids, result_company_ids, total_results, expires_at")
    .eq("workspace_id", ctx.workspaceId)
    .eq("query_normalized", cacheLookupKey)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cacheHit) {
    const ids =
      category === "people"
        ? ((cacheHit.result_candidate_ids as string[] | null) ?? [])
        : ((cacheHit.result_company_ids as string[] | null) ?? []);
    await logUsage({
      workspaceId: ctx.workspaceId,
      userId,
      operationType: category === "people" ? "profile_search" : "company_search",
      creditsUsed: 0,
      cacheHit: true,
    });
    return {
      data: { candidateIds: ids, total: cacheHit.total_results ?? ids.length },
      cacheHit: true,
      creditsUsed: 0,
    };
  }

  // ----- Cache miss: call /search/llm -----
  const count = options.count ?? 25;
  const enrichLive = options.enrichLive ?? false;
  const start = Date.now();
  const resp = await rawSearchLLM(query, { category, count, enrich_live: enrichLive });
  const responseMs = Date.now() - start;

  // Persist each result, then collect ids.
  const resultIds: string[] = [];
  for (const raw of resp.results) {
    try {
      if (category === "people") {
        // Treat each result as a profile shape we can persist directly.
        // The /search/llm response for people is structurally close to
        // /enrich/profile's `profile`, so we wrap it.
        const enriched: DfB2BEnrichResponse = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          profile: raw as any,
        };
        const linkedinUrl =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((raw as any).links?.linkedin as string | undefined) ?? null;
        const persisted = await persistCandidate({
          workspaceId: ctx.workspaceId,
          enriched,
          linkedinUrl,
          source: "dataforb2b",
        });
        resultIds.push(persisted.id);
      } else {
        const persisted = await persistCompany({
          workspaceId: ctx.workspaceId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          enriched: raw as any,
          source: "dataforb2b",
        });
        resultIds.push(persisted.id);
      }
    } catch (e) {
      console.error(`[sourcing] skip ${category} search result:`, e);
    }
  }

  // Persist the search row + log.
  const creditsUsed = resp.results.length * (enrichLive ? 1.5 : 0.75);
  await db.from("search_cache").insert({
    workspace_id: ctx.workspaceId,
    query_text: query,
    query_normalized: cacheLookupKey,
    query_filters: options.filters ?? {},
    result_candidate_ids: category === "people" ? resultIds : [],
    result_company_ids: category === "company" ? resultIds : [],
    total_results: resp.total,
    credits_used: creditsUsed,
    user_id: userId,
  });
  await logUsage({
    workspaceId: ctx.workspaceId,
    userId,
    operationType: category === "people" ? "profile_search" : "company_search",
    creditsUsed,
    cacheHit: false,
    apiResponseStatus: 200,
    apiResponseTimeMs: responseMs,
  });

  return {
    data: { candidateIds: resultIds, total: resp.total },
    cacheHit: false,
    creditsUsed,
  };
}

// ---- Stable stringify for filter cache key -------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

// ---- Re-exports for callers that need URL helpers ------------------

export { normalizeLinkedinUrl, looksLikeLinkedinUrl } from "./_internal/raw-client";
