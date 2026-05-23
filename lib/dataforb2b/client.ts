import "server-only";

/**
 * Thin wrapper over the DataForB2B API.
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
