/**
 * Unipile LinkedIn profile fetcher — secondary enrichment provider.
 *
 * Used as the fallback when Coresignal 404s a candidate. Unipile
 * tunnels through the recruiter's connected LinkedIn account
 * (legitimate OAuth-like session), so it can fetch ANY profile the
 * recruiter can see in their own LinkedIn — which is a much higher
 * coverage than Coresignal's licensed index.
 *
 * Endpoint:
 *   GET /api/v1/users/{public_identifier}?account_id={connected_account_id}
 *
 * Where:
 *   public_identifier = the LinkedIn URL slug (e.g. "landymillan")
 *   connected_account_id = our hiring.connected_accounts.unipile_account_id
 *
 * Auth: same X-API-KEY header pattern as the rest of unipile/client.ts.
 *
 * Ban risk: low. Unipile uses legitimate session infrastructure +
 * built-in rate limiting; LinkedIn doesn't see automation patterns.
 * The recruiter's own LinkedIn account is doing the work in their
 * name — same risk profile as if they'd manually loaded the page.
 */

import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { canonicalizeLinkedinUrl, linkedinPublicId } from "@/lib/linkedin";
import { UnipileError, listAccounts } from "./client";
import type { ParsedProfile } from "@/lib/resume-parse";

// ============================================================
// LinkedIn account_id resolution
// ============================================================
//
// Account management lives at Unipile's dashboard (we removed the
// in-app /settings/integrations page). To enrich a candidate we
// just need ONE LinkedIn account_id from the tenant.
//
// Resolution order:
//   1. UNIPILE_LINKEDIN_ACCOUNT_ID env var (manual override —
//      useful when you have multiple accounts and want to pin one).
//   2. listAccounts() → pick the first type=LINKEDIN account.
//   3. Cache the result for 5 minutes so we don't hammer the
//      /accounts endpoint on every enrichment.

let cachedAccountId: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

async function resolveLinkedinAccountId(): Promise<string | null> {
  const fromEnv = process.env.UNIPILE_LINKEDIN_ACCOUNT_ID?.trim();
  if (fromEnv) return fromEnv;

  if (cachedAccountId && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedAccountId;
  }
  try {
    const res = await listAccounts();
    const linkedin = res.items.find(
      (a) => (a.type ?? "").toUpperCase() === "LINKEDIN",
    );
    if (linkedin?.id) {
      cachedAccountId = linkedin.id;
      cachedAt = Date.now();
      return linkedin.id;
    }
  } catch (e) {
    console.error("[unipile] listAccounts during resolve failed:", e);
  }
  return null;
}

// ============================================================
// Config (reuses unipile/client.ts env vars)
// ============================================================

function unipileBaseUrl(): string {
  const dsn = process.env.UNIPILE_DSN;
  if (!dsn) throw new Error("UNIPILE_DSN env var not set");
  // v2 (current). v1 also exists on the same tenant but uses
  // different field names and may not return full experience.
  return `https://${dsn}/api/v2`;
}

function unipileApiKey(): string {
  const key = process.env.UNIPILE_API_KEY;
  if (!key) throw new Error("UNIPILE_API_KEY env var not set");
  return key;
}

// ============================================================
// Unipile UserProfile response shape (lenient — fields are optional
// because Unipile evolves and we want best-effort mapping).
// ============================================================

// Lenient shape — Unipile rotates field names across versions
// (experience vs experiences vs work_experience, education vs
// schools, etc.). We accept any common spelling and the mapper
// reads from whichever one is populated.
interface UnipileUserProfile {
  object?: string;
  provider?: string;
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  name?: string;
  headline?: string;
  summary?: string;
  about?: string;
  location?: string;
  location_full?: string;
  country?: string;
  city?: string;
  region?: string;
  industry?: string;
  profile_picture_url?: string;
  profile_picture_url_large?: string;
  picture_url?: string;
  linkedin_url?: string;
  is_premium?: boolean;
  is_creator?: boolean;
  current_position?: Array<{
    company?: string;
    title?: string;
    description?: string;
    location?: string;
    start?: { year?: number; month?: number };
    company_logo_url?: string;
  }>;
  // Multiple possible field names — Unipile v1 uses `experience`,
  // v2 uses `experiences`, some endpoints use `work_experience`.
  experience?: Array<UnipileExperienceItem>;
  experiences?: Array<UnipileExperienceItem>; // v2 plural
  work_experience?: Array<UnipileExperienceItem>; // some endpoints
  education?: Array<UnipileEducationItem>;
  educations?: Array<UnipileEducationItem>;
  schools?: Array<UnipileEducationItem>;
  skills?: Array<string | { name?: string }>;
  languages?: Array<string | { name?: string }>;
  certifications?: Array<{ name?: string; authority?: string }>;
  follower_count?: number;
  connection_count?: number;
}

interface UnipileExperienceItem {
  company?: string;
  company_name?: string;
  title?: string;
  position?: string;
  role?: string;
  description?: string;
  location?: string;
  start?: { year?: number; month?: number } | string;
  end?: { year?: number; month?: number } | string | null;
  start_date?: string;
  end_date?: string;
  starts_at?: { year?: number; month?: number };
  ends_at?: { year?: number; month?: number };
  company_logo_url?: string;
  is_current?: boolean;
}

interface UnipileEducationItem {
  school?: string;
  school_name?: string;
  institution?: string;
  degree?: string;
  field_of_study?: string;
  field?: string;
  description?: string;
  start?: { year?: number } | string;
  end?: { year?: number } | string;
  start_year?: number | string;
  end_year?: number | string;
  starts_at?: { year?: number };
  ends_at?: { year?: number };
  school_logo_url?: string;
}

// ============================================================
// Public API
// ============================================================

export type UnipileFetchResult =
  | { ok: true; status: 200; data: UnipileUserProfile }
  | { ok: false; status: number; error: string };

/**
 * Fetch a LinkedIn profile via the recruiter's connected Unipile
 * account. `publicIdentifier` is the slug from a /in/<slug>/ URL.
 */
export async function fetchUnipileProfile(
  publicIdentifier: string,
  unipileAccountId: string,
): Promise<UnipileFetchResult> {
  if (!publicIdentifier || !unipileAccountId) {
    return { ok: false, status: 400, error: "Missing identifier or account" };
  }
  // Unipile path: /api/v2/users/{public_id}?account_id=X. This is
  // the only pattern that's returned 200 in our testing.
  // Tried earlier and failed:
  //   - /api/v2/{account_id}/users/{public_id}    → "Cannot GET"
  //   - ...?linkedin_sections=*                    → "Cannot GET"
  //     (the `*` value likely breaks Unipile's route matcher)
  // Without expansion params, Unipile returns the top-card-only
  // payload (name + headline + current_position) which is enough
  // to populate the candidate's header. Full experience/education
  // arrays require a different endpoint we haven't discovered yet
  // — TODO when we have access to Unipile's v2 LinkedIn docs.
  const params = new URLSearchParams({
    account_id: unipileAccountId,
  });
  const url = `${unipileBaseUrl()}/users/${encodeURIComponent(
    publicIdentifier,
  )}?${params.toString()}`;
  console.log("[unipile profile] fetching:", url);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": unipileApiKey(),
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!res.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "message" in payload &&
        typeof (payload as { message: unknown }).message === "string"
          ? (payload as { message: string }).message
          : `Unipile profile fetch failed: HTTP ${res.status}`;
      return { ok: false, status: res.status, error: message };
    }
    // Log keys so we can verify which field names Unipile is using
    // (experience vs experiences vs work_experience, education vs
    // educations vs schools). Helps debug missing fields.
    if (payload && typeof payload === "object") {
      const keys = Object.keys(payload).sort();
      console.log("[unipile profile] response keys:", keys);
      const p = payload as UnipileUserProfile;
      console.log(
        "[unipile profile] counts:",
        "experience=", (p.experience ?? p.experiences ?? p.work_experience ?? []).length,
        "education=", (p.education ?? p.educations ?? p.schools ?? []).length,
        "skills=", (p.skills ?? []).length,
      );
    }
    return { ok: true, status: 200, data: payload as UnipileUserProfile };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============================================================
// Mapping Unipile → our ParsedProfile shape
// ============================================================

// Coerces any of Unipile's "when" representations to YYYY-MM-DD.
// Accepts {year, month}, "2023-05", "2023", "2023-05-01", or null.
function ymToDate(
  ym?: { year?: number; month?: number } | string | null,
): string | undefined {
  if (!ym) return undefined;
  if (typeof ym === "string") {
    // Already a string — try to parse "YYYY", "YYYY-MM", "YYYY-MM-DD"
    const m = ym.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!m) return undefined;
    return `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}`;
  }
  if (!ym.year) return undefined;
  const m = String(ym.month ?? 1).padStart(2, "0");
  return `${ym.year}-${m}-01`;
}

function getYear(
  raw?: { year?: number } | string | number | null,
): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") {
    const m = raw.match(/(\d{4})/);
    return m ? m[1] : undefined;
  }
  return raw.year != null ? String(raw.year) : undefined;
}

function mapUnipileToParsedProfile(
  p: UnipileUserProfile,
  url: string,
): ParsedProfile {
  // Resolve the experience array from whichever name Unipile used
  // (v1=experience, v2=experiences, some endpoints=work_experience).
  const rawExperience =
    p.experience ?? p.experiences ?? p.work_experience ?? [];
  const experience = rawExperience.map((e: UnipileExperienceItem) => ({
    company: (e.company ?? e.company_name ?? "").trim(),
    title: (e.title ?? e.position ?? e.role ?? "").trim(),
    start_date:
      ymToDate(e.start ?? e.starts_at ?? null) ??
      (e.start_date ? ymToDate(e.start_date) : undefined),
    end_date:
      ymToDate(e.end ?? e.ends_at ?? null) ??
      (e.end_date ? ymToDate(e.end_date) : undefined),
    location: e.location?.trim() || undefined,
    description: e.description?.trim() || undefined,
    company_logo_url: e.company_logo_url ?? undefined,
    is_current:
      typeof e.is_current === "boolean"
        ? e.is_current
        : !e.end && !e.ends_at && !e.end_date,
  }));

  // Unipile sometimes splits "current_position" from "experience" —
  // merge any current_position entries that aren't already in experience.
  for (const cp of p.current_position ?? []) {
    const already = experience.some(
      (x) =>
        x.is_current &&
        x.company === (cp.company ?? "").trim() &&
        x.title === (cp.title ?? "").trim(),
    );
    if (!already && (cp.company || cp.title)) {
      experience.unshift({
        company: (cp.company ?? "").trim(),
        title: (cp.title ?? "").trim(),
        start_date: ymToDate(cp.start),
        end_date: undefined,
        location: cp.location?.trim() || undefined,
        description: cp.description?.trim() || undefined,
        company_logo_url: cp.company_logo_url ?? undefined,
        is_current: true,
      });
    }
  }

  // Same idea for education — accept multiple field names.
  const rawEducation =
    p.education ?? p.educations ?? p.schools ?? [];
  const education = rawEducation.map((e: UnipileEducationItem) => ({
    school: (e.school ?? e.school_name ?? e.institution ?? "").trim(),
    degree: e.degree?.trim() || undefined,
    field: (e.field_of_study ?? e.field)?.trim() || undefined,
    start_year:
      getYear(e.start ?? e.starts_at ?? null) ??
      getYear(e.start_year ?? null),
    end_year:
      getYear(e.end ?? e.ends_at ?? null) ?? getYear(e.end_year ?? null),
    school_logo_url: e.school_logo_url ?? undefined,
  }));

  const skills = (p.skills ?? [])
    .map((s) => (typeof s === "string" ? s : s.name ?? ""))
    .filter(Boolean);
  const languages = (p.languages ?? [])
    .map((l) => (typeof l === "string" ? l : l.name ?? ""))
    .filter(Boolean);

  const current = experience.find((x) => x.is_current);
  const composedLocation =
    p.location ||
    [p.city, p.region, p.country].filter(Boolean).join(", ") ||
    undefined;

  return {
    full_name:
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
      undefined,
    location: composedLocation,
    linkedin_url: p.linkedin_url || url,
    summary: p.summary?.trim() || undefined,
    current_title: current?.title ?? undefined,
    current_company: current?.company ?? undefined,
    experience,
    education,
    skills,
    languages,
    profile_picture_url:
      p.profile_picture_url_large ?? p.profile_picture_url ?? undefined,
  };
}

function pickRowUpdates(p: UnipileUserProfile) {
  const current = (p.experience ?? []).find((e) =>
    typeof e.is_current === "boolean" ? e.is_current : !e.end,
  );
  const cp = (p.current_position ?? [])[0];
  return {
    headline: p.headline?.trim() ?? null,
    current_position: (current?.title ?? cp?.title)?.trim() ?? null,
    current_company_name:
      (current?.company ?? cp?.company)?.trim() ?? null,
    profile_picture_url:
      p.profile_picture_url_large ?? p.profile_picture_url ?? null,
    location:
      p.location ||
      [p.city, p.region, p.country].filter(Boolean).join(", ") ||
      null,
    full_name:
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null,
  };
}

// ============================================================
// High-level: enrich a candidate by id via Unipile
// ============================================================

type EnrichOk = {
  ok: true;
  cached: false;
  parsedProfile: ParsedProfile;
};
type EnrichErr = { ok: false; error: string };

/**
 * Daily cap on Unipile profile fetches per workspace. Mitigates
 * LinkedIn ban risk by keeping fetch volume well below the
 * threshold at which LinkedIn starts surfacing CAPTCHAs (~100/day
 * on Premium / Sales Navigator). Set conservatively at 45/day so
 * even with a few in-app "Enrich" clicks layered on top of the
 * extension's cascade, we stay safe.
 *
 * Tune here when needed. Future: make per-workspace configurable
 * via /settings/integrations.
 */
export const DAILY_UNIPILE_LIMIT = 45;

/**
 * Count today's successful Unipile enrichments for this workspace.
 * Used to gate further fetches when we're near the daily cap.
 */
async function countTodaysUnipileFetches(
  db: Awaited<ReturnType<typeof hiring>>,
  workspaceId: string,
): Promise<number> {
  // Start-of-day in UTC. Recruiter timezones vary but a UTC day is
  // a fine bucket for rate-limit purposes (LinkedIn's own throttles
  // are sliding window anyway).
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("candidates")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("enrichment_status", "unipile_ok")
    .gte("enriched_at", startOfDay.toISOString());
  return count ?? 0;
}

/**
 * Mirror of enrichCandidateFromLinkedin (coresignal) but uses
 * Unipile. Picks the first connected LinkedIn account in the
 * workspace, fetches the profile, and writes the same columns +
 * parsed_profile that Coresignal would.
 *
 * Does NOT check cache — caller is expected to invoke this after
 * Coresignal has already failed, so freshness logic doesn't apply.
 *
 * Rate-limited: returns a soft error when the workspace has hit
 * DAILY_UNIPILE_LIMIT for the UTC day.
 *
 * Idempotent: re-running just overwrites the candidate fields with
 * latest Unipile data.
 */
export async function enrichCandidateViaUnipile(
  candidateId: string,
): Promise<EnrichOk | EnrichErr> {
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  // Rate-limit gate. Check BEFORE any LinkedIn-touching work so we
  // don't burn a Unipile call only to drop the row.
  const todayCount = await countTodaysUnipileFetches(db, workspaceId);
  if (todayCount >= DAILY_UNIPILE_LIMIT) {
    return {
      ok: false,
      error: `Límite diario de Unipile alcanzado (${DAILY_UNIPILE_LIMIT}). Intenta mañana o edita el candidato a mano.`,
    };
  }

  const { data: cand } = await db
    .from("candidates")
    .select("id, workspace_id, linkedin_url, full_name")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand) return { ok: false, error: "Candidate not found" };
  if (cand.workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace candidate" };
  }

  const url = canonicalizeLinkedinUrl(cand.linkedin_url as string | null);
  if (!url) return { ok: false, error: "Candidate has no LinkedIn URL" };
  const publicId = linkedinPublicId(url);
  if (!publicId) return { ok: false, error: "Could not derive public_id" };

  // Pull the LinkedIn account_id straight from Unipile. Account
  // management lives at Unipile's dashboard now (we deprecated the
  // in-app /settings/integrations page); we just need the id.
  //
  // Allows a manual override via env var UNIPILE_LINKEDIN_ACCOUNT_ID
  // when you want to pin a specific account or avoid the
  // listAccounts call on every enrichment.
  const linkedinAccountId = await resolveLinkedinAccountId();
  if (!linkedinAccountId) {
    return {
      ok: false,
      error:
        "No hay cuenta de LinkedIn conectada en Unipile. Conéctala en el dashboard de Unipile.",
    };
  }

  const res = await fetchUnipileProfile(publicId, linkedinAccountId);
  if (!res.ok) {
    // Persist the failure status so we don't hammer Unipile on
    // every page render. The candidate row stays in DB.
    await db
      .from("candidates")
      .update({
        enrichment_status: `unipile_err_${res.status}`,
        enriched_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    return { ok: false, error: res.error };
  }

  const parsed = mapUnipileToParsedProfile(res.data, url);
  const updates = pickRowUpdates(res.data);

  // Don't blow away an existing full_name if Unipile didn't return
  // one — keep what was there.
  const patch: Record<string, unknown> = {
    parsed_profile: parsed,
    enriched_at: new Date().toISOString(),
    enrichment_status: "unipile_ok",
    enrichment_source: "unipile",
    headline: updates.headline,
    current_position: updates.current_position,
    current_company_name: updates.current_company_name,
    profile_picture_url: updates.profile_picture_url,
    location: updates.location,
    linkedin_public_id: publicId,
  };
  if (updates.full_name && (!cand.full_name || /unknown/i.test(cand.full_name as string))) {
    patch.full_name = updates.full_name;
  }
  await db.from("candidates").update(patch).eq("id", candidateId);

  return { ok: true, cached: false, parsedProfile: parsed };
}

// Re-export the Unipile error type for callers that want to branch
// on it (the upstream client throws UnipileError; we wrap in result
// here but the type is useful to callers).
export { UnipileError };
