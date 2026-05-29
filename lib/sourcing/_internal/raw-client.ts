import "server-only";

/**
 * ⚠️ INTERNAL ONLY — do NOT import from outside lib/sourcing/.
 *
 * Raw HTTP client for the DataForB2B API. Every public consumer must
 * go through lib/sourcing/dataforb2b.ts (the cache-first wrapper)
 * which checks Supabase before calling these functions and logs every
 * hit in hiring.api_usage_log.
 *
 * Calling these directly bypasses the cache and is forbidden by
 * project convention.
 *
 * https://docs.dataforb2b.ai
 *
 * One workspace = one key for now. Stored in env as DATAFOR_B2B_API_KEY.
 * Per-workspace keys can come later if/when we onboard other agencies.
 */

const BASE_URL = "https://api.dataforb2b.ai";

function apiKey(): string {
  const k = process.env.DATAFOR_B2B_API_KEY;
  if (!k) {
    throw new Error(
      "Missing DATAFOR_B2B_API_KEY env var. Set it in Vercel + .env.local.",
    );
  }
  return k;
}

// ----- Response shape for POST /enrich/profile -----------------------
// Mirrored from docs.dataforb2b.ai/llms-full.txt. Anything we don't use
// is still allowed via Record<string, unknown> on the leaves.

export type DfB2BCompany = {
  id?: string;
  name?: string;
  url?: string;
  logo_url?: string;
  size?: string;
  industry?: string;
};

export type DfB2BSchool = {
  id?: string;
  name?: string;
  url?: string;
  logo_url?: string;
};

export type DfB2BExperience = {
  company?: DfB2BCompany;
  title?: string;
  employment_type?: string;
  location?: string;
  duration_months?: number;
  start_date?: string; // YYYY-MM
  end_date?: string | null;
  is_current?: boolean;
};

export type DfB2BEducation = {
  school?: DfB2BSchool;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
};

export type DfB2BProfile = {
  id?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string;
  country?: string;
  industry?: string;
  summary?: string;
  profile_picture_url?: string;
  links?: {
    linkedin?: string;
    twitter?: string | null;
    github?: string | null;
  };
  experience?: DfB2BExperience[];
  education?: DfB2BEducation[];
  skills?: string[];
  metrics?: {
    followers?: number;
    skills_count?: number;
  };
};

export type DfB2BEnrichResponse = {
  profile: DfB2BProfile;
  work_email?: string | null;
  personal_email?: string | null;
  phone?: string | null;
  git_profile?: {
    username?: string;
    repos_count?: number;
    contributions_last_year?: number;
  };
};

export type EnrichOptions = {
  /** Email/phone enrichment costs extra credits — opt-in per call. */
  enrich_work_email?: boolean;
  enrich_personal_email?: boolean;
  enrich_phone?: boolean;
};

/**
 * Enrich one LinkedIn profile.
 *
 * `profile` can be a full LinkedIn URL, a short URL (linkedin.com/in/x),
 * a public ID ("john-doe"), or a DfB2B encoded ID ("prof_xxx"). The
 * encoded ID is the recommended fastest path — but for our use case
 * (recruiter pastes a URL) we just pass the URL through.
 *
 * Cost: 1.5 credits base. +3 work_email, +1 personal_email, +10 phone.
 */
export async function enrichProfile(
  profile: string,
  options: EnrichOptions = {},
): Promise<DfB2BEnrichResponse> {
  const res = await fetch(`${BASE_URL}/enrich/profile`, {
    method: "POST",
    headers: {
      api_key: apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // API expects `profile_identifier`, not `profile` — the docs
      // index uses `profile` but the live endpoint rejects that.
      profile_identifier: profile,
      enrich_profile: true,
      enrich_work_email: options.enrich_work_email ?? false,
      enrich_personal_email: options.enrich_personal_email ?? false,
      enrich_phone: options.enrich_phone ?? false,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      // ignore
    }
    throw new Error(
      `DataForB2B /enrich/profile failed: ${res.status} ${res.statusText}${
        detail ? ` — ${detail}` : ""
      }`,
    );
  }
  return (await res.json()) as DfB2BEnrichResponse;
}

// ----- Response shape for POST /enrich/company ----------------------

export type DfB2BCompanyEnriched = {
  id?: string;
  name?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  logo_url?: string;
  founded_year?: number;
  company_type?: string;
  headquarters?: {
    country?: string;
    city?: string;
    region?: string;
  };
  size?: {
    employees?: number;
    range_min?: number;
    range_max?: number;
  };
  links?: {
    website?: string;
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    facebook?: string;
  };
  metrics?: {
    followers?: number;
    active_jobs?: number;
  };
  growth?: {
    percent_1m?: number;
    percent_6m?: number;
    percent_12m?: number;
    recent_hires?: number;
  };
};

export type DfB2BCompanyEnrichResponse = {
  company: DfB2BCompanyEnriched;
};

/**
 * Enrich a single company. Identifier formats accepted:
 *   - slug:        "google"
 *   - LinkedIn URL: "https://www.linkedin.com/company/google/"
 *   - short URL:   "linkedin.com/company/google"
 *   - encoded ID:  "org_xxx"
 *
 * Cost: 1.5 credits per call.
 */
export async function enrichCompany(
  identifier: string,
): Promise<DfB2BCompanyEnrichResponse> {
  const res = await fetch(`${BASE_URL}/enrich/company`, {
    method: "POST",
    headers: {
      api_key: apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ company_identifier: identifier }),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      // ignore
    }
    throw new Error(
      `DataForB2B /enrich/company failed: ${res.status} ${res.statusText}${
        detail ? ` — ${detail}` : ""
      }`,
    );
  }
  return (await res.json()) as DfB2BCompanyEnrichResponse;
}

// ----- Response shape for POST /search/llm --------------------------

export type DfB2BLlmSearchOptions = {
  category: "people" | "company";
  /** Trigger lookalike mode when query is a LinkedIn URL. */
  lookalike_use_case?: "sales" | "recruiter";
  /** Default 25, max 100. */
  count?: number;
  /** true (1.5 cr/result) vs false (0.75 cr/result). */
  enrich_live?: boolean;
};

export type DfB2BLlmSearchResponse = {
  query_interpretation?: {
    original_query?: string;
    detected_category?: string;
    extracted_filters?: Record<string, unknown>;
    advanced_filters?: Record<string, unknown>;
    requested_count?: number;
  };
  total: number;
  count: number;
  /** People results carry DfB2BProfile-like fields. Company results
   *  carry DfB2BCompanyEnriched-like fields. We type as unknown[] here
   *  and narrow at the wrapper level. */
  results: Array<Record<string, unknown>>;
};

/**
 * Natural-language search: "qué senior engineers en CDMX trabajaron
 * en fintech YC". Returns either people or companies depending on
 * `category`. Min query length: 3 chars.
 *
 * Cost: count × (enrich_live ? 1.5 : 0.75) credits.
 */
export async function searchLLM(
  query: string,
  options: DfB2BLlmSearchOptions,
): Promise<DfB2BLlmSearchResponse> {
  const res = await fetch(`${BASE_URL}/search/llm`, {
    method: "POST",
    headers: {
      api_key: apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      category: options.category,
      ...(options.lookalike_use_case
        ? { lookalike_use_case: options.lookalike_use_case }
        : {}),
      ...(typeof options.count === "number" ? { count: options.count } : {}),
      ...(typeof options.enrich_live === "boolean"
        ? { enrich_live: options.enrich_live }
        : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      // ignore
    }
    throw new Error(
      `DataForB2B /search/llm failed: ${res.status} ${res.statusText}${
        detail ? ` — ${detail}` : ""
      }`,
    );
  }
  return (await res.json()) as DfB2BLlmSearchResponse;
}

// NOTE: a POST /search/companies `domain =` filter wrapper used to live
// here, but it does NOT filter in cached mode (the cached company index
// has null domains and the filter is silently ignored — verified against
// the live API for canva.com, which returned 10 random companies).
// Domain enrichment now resolves the domain to a slug and uses
// /enrich/company instead — see enrichCompanyByDomain in dataforb2b.ts.

// ----- Response shape for GET /account ------------------------------

export type DfB2BAccountResponse = {
  valid: boolean;
  credits: number;
};

/** Returns remaining credits + API key validity. No cost. */
export async function getAccount(): Promise<DfB2BAccountResponse> {
  const res = await fetch(`${BASE_URL}/account`, {
    method: "GET",
    headers: { api_key: apiKey() },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`DataForB2B /account failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as DfB2BAccountResponse;
}

/** Derive a canonical LinkedIn company URL slug from any LinkedIn
 *  company URL or slug. "google" / "linkedin.com/company/google/" /
 *  "https://linkedin.com/company/google" → "google". */
export function linkedinCompanySlug(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  // Already a slug.
  if (/^[a-z0-9][a-z0-9._-]*$/.test(s)) return s;
  const m = /linkedin\.com\/company\/([a-z0-9._-]+)/.exec(s);
  return m ? m[1] : null;
}

/** Cheap precheck: is the URL plausibly a LinkedIn profile URL? */
export function looksLikeLinkedinUrl(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return (
    /^https?:\/\/(www\.)?linkedin\.com\/in\//.test(trimmed) ||
    /^linkedin\.com\/in\//.test(trimmed)
  );
}

/** Normalize a LinkedIn URL: strip query, fragment, trailing slash. */
export function normalizeLinkedinUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//.test(s)) {
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    return `${u.origin.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return s;
  }
}
