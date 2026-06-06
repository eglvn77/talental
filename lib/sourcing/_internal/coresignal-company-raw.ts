import "server-only";

/**
 * Raw HTTP client for Coresignal's Clean Company API.
 *
 * Pattern mirrors the Clean Employee client:
 *   1. POST /v2/company_clean/search/filter
 *      body: {website: "<domain>"} → array of integer ids
 *   2. GET /v2/company_clean/collect/{id} → full record
 *
 * Same auth header (apikey: <token>) as the Clean Employee API.
 */

const BASE = "https://api.coresignal.com/cdapi/v2";

export type CoresignalCompanyRawError = {
  ok: false;
  status: number;
  error: string;
};

export type CoresignalCompany = {
  id?: number | string;
  name?: string;
  website?: string;
  industry?: string;
  description?: string;
  size?: string;
  employees_count?: number;
  founded?: number | string;
  founded_year?: number;
  hq_country?: string;
  hq_country_parsed?: string;
  hq_city?: string;
  linkedin_url?: string;
  linkedin_shorthand?: string;
  logo_url?: string;
  type?: string;
  company_type?: string;
  funding_total_amount?: number;
  funding_last_round_type?: string;
  followers_count?: number;
  // Catch-all so consumers can read anything we didn't type.
  [key: string]: unknown;
};

function apiKey(): string {
  const k = process.env.CORESIGNAL_API_KEY;
  if (!k) throw new Error("Missing CORESIGNAL_API_KEY");
  return k;
}

/**
 * Look up a company by website domain. Returns the full Coresignal
 * Clean Company record on success, or {ok:false} with status + body
 * text. Empty search → synthetic 404.
 *
 * - 404 = "not in dataset"; do not retry.
 * - 429 = rate limit; caller decides backoff.
 */
export async function enrichCompanyByDomainRaw(
  domain: string,
): Promise<
  { ok: true; data: CoresignalCompany } | CoresignalCompanyRawError
> {
  const clean = domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").trim();
  if (!clean) return { ok: false, status: 0, error: "Empty domain" };

  // ── Step 1: search by website. ────────────────────────────────
  const searchRes = await fetch(`${BASE}/company_clean/search/filter`, {
    method: "POST",
    headers: { apikey: apiKey(), "content-type": "application/json" },
    body: JSON.stringify({ website: clean }),
    cache: "no-store",
  });
  if (!searchRes.ok) {
    const text = await searchRes.text().catch(() => "");
    return {
      ok: false,
      status: searchRes.status,
      error: `search: ${text.slice(0, 400) || searchRes.status}`,
    };
  }
  const ids = (await searchRes.json()) as unknown;
  const firstId = Array.isArray(ids) && ids.length > 0 ? ids[0] : null;
  if (firstId == null) {
    return {
      ok: false,
      status: 404,
      error: `No Coresignal company for domain '${clean}'`,
    };
  }

  // ── Step 2: collect by id. ───────────────────────────────────
  const collectRes = await fetch(
    `${BASE}/company_clean/collect/${encodeURIComponent(String(firstId))}`,
    {
      method: "GET",
      headers: { apikey: apiKey() },
      cache: "no-store",
    },
  );
  if (!collectRes.ok) {
    const text = await collectRes.text().catch(() => "");
    return {
      ok: false,
      status: collectRes.status,
      error: `collect: ${text.slice(0, 400) || collectRes.status}`,
    };
  }
  const data = (await collectRes.json()) as CoresignalCompany;
  return { ok: true, data };
}
