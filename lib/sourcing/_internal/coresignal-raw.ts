import "server-only";

/**
 * Raw HTTP client for Coresignal's Clean Employee API.
 *
 * - Auth via `apikey: <token>` header (Coresignal's own pattern, not
 *   Bearer). Token comes from CORESIGNAL_API_KEY.
 * - Endpoints used:
 *   * `GET /v2/employee_multi_source/enrich?id=<…>`              not used
 *   * `GET /v2/employee_clean/enrich?linkedin_shorthand_name=<…>` LinkedIn URL → profile
 *
 * Failure modes are explicit `{ ok: false, status, error }` so callers
 * don't have to try/catch and can decide cost-aware retries.
 *
 * This module is internal — every external caller must go through
 * `lib/sourcing/coresignal.ts` which adds cache + usage logging.
 */

const BASE = "https://api.coresignal.com/cdapi/v2";

export type CoresignalRawError = {
  ok: false;
  status: number;
  error: string;
};

export type CoresignalEmployee = {
  // Coresignal returns ~90 fields; we only carry what we map. Anything
  // else is preserved as raw_payload in the caller for future use.
  id?: number | string;
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  summary?: string;
  location_full?: string;
  location_country?: string;
  picture_url?: string;
  profile_picture_url?: string;
  linkedin_url?: string;
  linkedin_shorthand_name?: string;
  experience?: Array<{
    title?: string;
    company_name?: string;
    company_logo?: string;
    company_linkedin_url?: string;
    company_url?: string;
    location?: string;
    description?: string;
    date_from?: string;
    date_to?: string;
    duration?: string;
    duration_months?: number;
    is_current?: boolean;
  }>;
  education?: Array<{
    title?: string;
    subtitle?: string;
    school?: string;
    school_url?: string;
    school_logo?: string;
    degree?: string;
    field_of_study?: string;
    date_from?: string;
    date_to?: string;
    year_from?: number | string;
    year_to?: number | string;
  }>;
  skills?: Array<{ name?: string } | string>;
  languages?: Array<{ name?: string; proficiency?: string } | string>;
  // Catch-all so consumers can inspect anything we didn't type out.
  [key: string]: unknown;
};

function apiKey(): string {
  const k = process.env.CORESIGNAL_API_KEY;
  if (!k) throw new Error("Missing CORESIGNAL_API_KEY");
  return k;
}

function shorthandFromUrl(url: string): string | null {
  // The slug after /in/ in a canonical LinkedIn profile URL.
  const m = /\/in\/([^/?#]+)/i.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Pull the `message` field out of a Coresignal error body. Their
 * non-2xx responses look like `{"message":"…","request_id":"…"}` —
 * surfacing just the message keeps recruiter-facing toasts clean.
 * Falls back to the original text on parse failure.
 */
function extractCoresignalMessage(rawText: string): string {
  if (!rawText) return "";
  try {
    const parsed = JSON.parse(rawText) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    /* not JSON — fall through */
  }
  return rawText.slice(0, 200);
}

/**
 * Enrich a single profile by LinkedIn URL.
 *
 * Coresignal's Clean Employee API doesn't expose a single-step
 * enrich endpoint — we have to do two calls:
 *   1. POST /v2/employee_clean/search/filter
 *      body: {"linkedin_shorthand_name": "<slug>"}
 *      → array of Coresignal integer IDs
 *   2. GET  /v2/employee_clean/collect/{id}
 *      → full Employee record
 *
 * Earlier tries against /enrich (GET and POST) returned 404 "no
 * Route matched", and /collect/{shorthand} hangs forever. The two
 * documented endpoints above are the working path.
 *
 * Notes:
 * - Empty search result → return 404-shaped error ("not in dataset");
 *   the caller persists that status and won't retry until cache TTL.
 * - 429 is rate limit; let the caller decide backoff.
 */
export async function enrichEmployeeByLinkedinUrl(
  linkedinUrl: string,
): Promise<{ ok: true; data: CoresignalEmployee } | CoresignalRawError> {
  const shorthand = shorthandFromUrl(linkedinUrl);
  if (!shorthand) {
    return { ok: false, status: 0, error: "URL has no /in/<shorthand>" };
  }

  // ── Step 1: search by shorthand → array of ids. ───────────────
  const searchUrl = `${BASE}/employee_clean/search/filter`;
  const searchRes = await fetch(searchUrl, {
    method: "POST",
    headers: {
      apikey: apiKey(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ linkedin_shorthand_name: shorthand }),
    cache: "no-store",
  });
  if (!searchRes.ok) {
    // Coresignal returns its own "no Route matched with those values"
    // when the shorthand isn't in their index — that's their way of
    // saying 404, not an endpoint-routing problem. Normalize to a
    // recruiter-readable string so the toast doesn't show raw JSON.
    const text = await searchRes.text().catch(() => "");
    const parsedMessage = extractCoresignalMessage(text);
    const isNotIndexed = /no\s+route\s+matched/i.test(parsedMessage);
    return {
      ok: false,
      status: isNotIndexed ? 404 : searchRes.status,
      error: isNotIndexed
        ? `LinkedIn profile '${shorthand}' isn't in Coresignal's index yet`
        : `Coresignal search failed (${searchRes.status}): ${parsedMessage || "unknown"}`,
    };
  }
  const ids = (await searchRes.json()) as unknown;
  const firstId = Array.isArray(ids) && ids.length > 0 ? ids[0] : null;
  if (firstId == null) {
    return {
      ok: false,
      status: 404,
      error: `LinkedIn profile '${shorthand}' isn't in Coresignal's index yet`,
    };
  }

  // ── Step 2: collect by id → full record. ──────────────────────
  const collectUrl = `${BASE}/employee_clean/collect/${encodeURIComponent(String(firstId))}`;
  const collectRes = await fetch(collectUrl, {
    method: "GET",
    headers: { apikey: apiKey() },
    cache: "no-store",
  });
  if (!collectRes.ok) {
    const text = await collectRes.text().catch(() => "");
    return {
      ok: false,
      status: collectRes.status,
      error: `collect: ${text.slice(0, 400) || collectRes.status}`,
    };
  }
  const data = (await collectRes.json()) as CoresignalEmployee;
  return { ok: true, data };
}
