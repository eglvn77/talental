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
  // Coresignal expects `linkedin_shorthand_name` = the slug after /in/.
  // canonicalizeLinkedinUrl in lib/linkedin.ts already lowercased + stripped
  // trailing slash, so /in/jane-doe → "jane-doe".
  const m = /\/in\/([^/?#]+)/i.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Enrich a single profile by LinkedIn URL. Returns the raw Coresignal
 * employee object on success, or `{ok:false}` with status + error.
 *
 * Notes:
 * - 404 is a "valid" response (profile not in their dataset). Callers
 *   should treat it as "no data" rather than retrying.
 * - 429 is rate limit; let the caller decide backoff.
 */
export async function enrichEmployeeByLinkedinUrl(
  linkedinUrl: string,
): Promise<{ ok: true; data: CoresignalEmployee } | CoresignalRawError> {
  const shorthand = shorthandFromUrl(linkedinUrl);
  if (!shorthand) {
    return { ok: false, status: 0, error: "URL has no /in/<shorthand>" };
  }
  const url = `${BASE}/employee_clean/enrich?linkedin_shorthand_name=${encodeURIComponent(shorthand)}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: apiKey() },
    cache: "no-store",
  });
  const responseTimeMs = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      error: text.slice(0, 500) || `HTTP ${res.status}`,
    };
  }
  const data = (await res.json()) as CoresignalEmployee;
  void responseTimeMs; // reserved for future logging in caller
  return { ok: true, data };
}
