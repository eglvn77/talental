import "server-only";

import { hiring, getRequestWorkspaceId } from "@/lib/hiring/clients";
import { getCurrentUser } from "@/lib/auth/session";
import { canonicalizeLinkedinUrl, linkedinPublicId } from "@/lib/linkedin";
import type { ParsedProfile } from "@/lib/resume-parse";
import {
  enrichEmployeeByLinkedinUrl,
  type CoresignalEmployee,
} from "./_internal/coresignal-raw";

/**
 * Public, cache-first wrapper over Coresignal's Clean Employee API.
 *
 * Mirrors the shape of lib/sourcing/dataforb2b.ts so existing callers
 * (slideover, careers apply, CSV import) can opt into Coresignal for
 * day-to-day enrichment while DfB2B handles volume backfills.
 *
 * Flow:
 *   1. Canonicalize URL → cache lookup on the candidates row.
 *   2. If `enriched_at` exists and is fresh AND was enriched via
 *      Coresignal → return cached `parsed_profile`.
 *   3. Otherwise call Coresignal, map → ParsedProfile, write back to
 *      `parsed_profile` + `enriched_at` + `enrichment_status` +
 *      `current_position` / `current_company_name` / `headline` /
 *      `summary` / `profile_picture_url`.
 *   4. Log the call in hiring.api_usage_log with provider='coresignal'.
 *
 * Returns `{ ok:false, error }` on missing key, bad URL, or 4xx/5xx.
 */

const FRESH_DAYS = 90; // refresh quarterly by default

export type EnrichResult = {
  ok: true;
  cached: boolean;
  parsedProfile: ParsedProfile;
  updated: {
    headline: string | null;
    current_position: string | null;
    current_company_name: string | null;
    profile_picture_url: string | null;
    location: string | null;
  };
};

export type EnrichError = { ok: false; error: string };

export async function enrichCandidateFromLinkedin(
  candidateId: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<EnrichResult | EnrichError> {
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  const { data: cand, error } = await db
    .from("candidates")
    .select(
      "id, workspace_id, linkedin_url, enriched_at, enrichment_status, parsed_profile",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (!cand) return { ok: false, error: "Candidate not found" };
  if (cand.workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace candidate" };
  }
  const url = canonicalizeLinkedinUrl(cand.linkedin_url as string | null);
  if (!url) return { ok: false, error: "Candidate has no LinkedIn URL" };

  // Cache hit: skip the API call when last enrichment is fresh and
  // came from this provider.
  if (
    !opts.forceRefresh &&
    cand.enriched_at &&
    cand.enrichment_status === "coresignal_ok" &&
    isFresh(cand.enriched_at as string, FRESH_DAYS)
  ) {
    return {
      ok: true,
      cached: true,
      parsedProfile: (cand.parsed_profile ?? emptyProfile()) as ParsedProfile,
      updated: {
        headline: null,
        current_position: null,
        current_company_name: null,
        profile_picture_url: null,
        location: null,
      },
    };
  }

  const t0 = Date.now();
  const res = await enrichEmployeeByLinkedinUrl(url);
  const ms = Date.now() - t0;

  if (!res.ok) {
    await logUsage({
      workspaceId,
      candidateId,
      url,
      status: res.status,
      ok: false,
      error: res.error,
      responseTimeMs: ms,
    });
    // Persist the failure so the UI can show it and we don't hammer
    // the API on retry.
    await db
      .from("candidates")
      .update({
        enrichment_status: `coresignal_err_${res.status}`,
        enriched_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    return { ok: false, error: res.error };
  }

  const parsed = mapCoresignalToParsedProfile(res.data, url);
  const updated = pickCandidateRowUpdates(res.data, url);

  await db
    .from("candidates")
    .update({
      parsed_profile: parsed as never,
      enriched_at: new Date().toISOString(),
      enrichment_status: "coresignal_ok",
      // Top-level columns get the best-effort scalars too so the
      // candidates list/table doesn't need to read the jsonb.
      headline: updated.headline,
      current_position: updated.current_position,
      current_company_name: updated.current_company_name,
      profile_picture_url: updated.profile_picture_url,
      location: updated.location,
      linkedin_public_id: linkedinPublicId(url),
    })
    .eq("id", candidateId);

  await logUsage({
    workspaceId,
    candidateId,
    url,
    status: 200,
    ok: true,
    responseTimeMs: ms,
  });

  return { ok: true, cached: false, parsedProfile: parsed, updated };
}

/**
 * Find or create a candidate from a LinkedIn URL. Used by the bulk
 * "paste URLs → create candidates" flow that used to live on
 * DataForB2B. Returns {id, full_name, cacheHit}: cacheHit=true means
 * the candidate already existed in this workspace.
 *
 * Creates the row with the LinkedIn slug as a placeholder name so
 * the DB sees a non-null full_name; the Coresignal enrich then
 * overrides it with the real name. Best-effort: failures during the
 * enrich step leave the candidate created but un-enriched.
 */
export async function findOrCreateCandidateFromLinkedin(args: {
  linkedinUrl: string;
  createdByTeamMemberId?: string | null;
}): Promise<{
  ok: true;
  data: { id: string; full_name: string };
  cacheHit: boolean;
} | { ok: false; error: string }> {
  const url = canonicalizeLinkedinUrl(args.linkedinUrl);
  if (!url) return { ok: false, error: "Invalid LinkedIn URL" };
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  // 1. Exact-URL match. Run the enricher and propagate its result —
  // a Coresignal 404 (or any other failure) must surface to the
  // caller; otherwise the UI shows a success toast for an enrich
  // that didn't actually happen.
  const { data: existing } = await db
    .from("candidates")
    .select("id, full_name")
    .eq("workspace_id", workspaceId)
    .eq("linkedin_url", url)
    .maybeSingle();
  if (existing) {
    const existingId = existing.id as string;
    const enrichRes = await enrichCandidateFromLinkedin(existingId);
    if (!enrichRes.ok) {
      return { ok: false, error: enrichRes.error };
    }
    return {
      ok: true,
      data: { id: existingId, full_name: existing.full_name as string },
      cacheHit: true,
    };
  }

  // 2. Create a stub row and let the enricher fill it.
  const publicId = linkedinPublicId(url);
  const placeholder = publicId
    ? publicId.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Unknown";
  const { data: created, error: insertErr } = await db
    .from("candidates")
    .insert({
      workspace_id: workspaceId,
      full_name: placeholder,
      linkedin_url: url,
      linkedin_public_id: publicId,
      default_source: "linkedin",
      created_by_team_member_id: args.createdByTeamMemberId ?? null,
    })
    .select("id")
    .single();
  if (insertErr || !created) {
    return { ok: false, error: insertErr?.message ?? "Insert failed" };
  }
  const newId = (created as { id: string }).id;
  const enrichRes = await enrichCandidateFromLinkedin(newId);
  if (!enrichRes.ok) {
    // The stub row stays in DB (so retries are idempotent — the next
    // attempt hits path 1 and re-tries the API). Surface the error so
    // the UI doesn't claim success on a failed enrichment.
    return { ok: false, error: enrichRes.error };
  }

  // Re-fetch in case enrichment updated the name.
  const { data: refreshed } = await db
    .from("candidates")
    .select("id, full_name")
    .eq("id", newId)
    .single();
  return {
    ok: true,
    data: {
      id: newId,
      full_name:
        ((refreshed as { full_name?: string } | null)?.full_name as string) ??
        placeholder,
    },
    cacheHit: false,
  };
}

// ── Mapping ─────────────────────────────────────────────────────────

function mapCoresignalToParsedProfile(
  emp: CoresignalEmployee,
  url: string,
): ParsedProfile {
  const experience = (emp.experience ?? []).map((e) => ({
    company: (e.company_name ?? "").trim(),
    title: (e.title ?? "").trim(),
    start_date: e.date_from ?? undefined,
    end_date: e.date_to ?? undefined,
    location: e.location?.trim() || undefined,
    description: e.description?.trim() || undefined,
    company_logo_url: e.company_logo ?? undefined,
    is_current:
      typeof e.is_current === "boolean"
        ? e.is_current
        : !e.date_to || /present|current/i.test(e.date_to),
    duration_months:
      typeof e.duration_months === "number" ? e.duration_months : undefined,
  }));

  const education = (emp.education ?? []).map((e) => ({
    school: (e.school ?? e.title ?? "").trim(),
    degree: e.degree?.trim() || undefined,
    field: e.field_of_study?.trim() || undefined,
    start_year:
      e.year_from != null
        ? String(e.year_from)
        : e.date_from?.slice(0, 4) || undefined,
    end_year:
      e.year_to != null
        ? String(e.year_to)
        : e.date_to?.slice(0, 4) || undefined,
    school_logo_url: e.school_logo ?? undefined,
  }));

  const skills = (emp.skills ?? [])
    .map((s) => (typeof s === "string" ? s : s.name ?? ""))
    .filter(Boolean);
  const languages = (emp.languages ?? [])
    .map((l) => (typeof l === "string" ? l : l.name ?? ""))
    .filter(Boolean);

  const current = experience.find((x) => x.is_current);

  return {
    full_name: emp.name?.trim() ||
      [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim() ||
      undefined,
    location: emp.location_full?.trim() ?? undefined,
    linkedin_url: emp.linkedin_url || url,
    summary: emp.summary?.trim() ?? undefined,
    current_title: current?.title ?? undefined,
    current_company: current?.company ?? undefined,
    experience,
    education,
    skills,
    languages,
    profile_picture_url:
      emp.profile_picture_url ?? emp.picture_url ?? undefined,
  };
}

function pickCandidateRowUpdates(emp: CoresignalEmployee, _url: string) {
  void _url;
  const exp = emp.experience ?? [];
  const current = exp.find((e) =>
    typeof e.is_current === "boolean"
      ? e.is_current
      : !e.date_to || /present|current/i.test(e.date_to),
  );
  return {
    headline: emp.headline?.trim() ?? null,
    current_position: current?.title?.trim() ?? null,
    current_company_name: current?.company_name?.trim() ?? null,
    profile_picture_url:
      emp.profile_picture_url ?? emp.picture_url ?? null,
    location: emp.location_full?.trim() ?? null,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function isFresh(iso: string, ttlDays: number): boolean {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ttlDays * 24 * 60 * 60 * 1000;
}

function emptyProfile(): ParsedProfile {
  return { experience: [], education: [], skills: [], languages: [] };
}

async function logUsage(args: {
  workspaceId: string;
  candidateId: string;
  url: string;
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
      // Webhook / cron context — no user. Fine.
    }
    await db.from("api_usage_log").insert({
      workspace_id: args.workspaceId,
      user_id: userId,
      operation_type: "coresignal_employee_clean_enrich",
      resource_external_id: args.url,
      resource_internal_id: args.candidateId,
      credits_used: args.ok ? 1 : 0,
      cache_hit: false,
      api_response_status: args.status,
      api_response_time_ms: args.responseTimeMs,
      // Surface Coresignal's actual error message so we can debug
      // 422/400/etc. from the SQL log without re-running.
      error_message: args.error ? args.error.slice(0, 1000) : null,
    });
  } catch {
    // Logging failures are never fatal.
  }
}
