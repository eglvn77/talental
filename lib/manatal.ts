import { getSupabaseAdmin } from "./supabase";

const BASE_URL = "https://api.manatal.com/open/v3";

// Token bucket rate limiter. The Manatal limit is 100 req / 60s and is shared
// with the user's Zapier flows on the same token, so we target ~60 req/min.
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil((1 - this.tokens) / this.refillPerSec * 1000);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  private refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.lastRefill = now;
  }
}

// 60 token capacity, refills at 1 token/sec → steady state of 60 req/min,
// can burst up to 60 then has to wait for refill.
const bucket = new TokenBucket(60, 1);

type FetchOpts = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  jobIdForLog?: number | null;
};

async function logSync(
  endpoint: string,
  status: number | null,
  startedAt: number,
  errorMessage: string | null,
  jobId: number | null,
) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("sync_log").insert({
      manatal_job_id: jobId,
      endpoint,
      status_code: status,
      duration_ms: Date.now() - startedAt,
      error_message: errorMessage,
    });
  } catch {
    // logging failures should not break the request flow
  }
}

async function manatalFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const token = process.env.MANATAL_API_TOKEN;
  if (!token) throw new Error("Missing MANATAL_API_TOKEN");

  await bucket.acquire();

  const url = `${BASE_URL}${path}`;
  const startedAt = Date.now();
  let res: Response | null = null;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      await logSync(path, res.status, startedAt, text.slice(0, 500), opts.jobIdForLog ?? null);
      throw new Error(`Manatal ${res.status} on ${path}: ${text.slice(0, 200)}`);
    }
    await logSync(path, res.status, startedAt, null, opts.jobIdForLog ?? null);
    return (await res.json()) as T;
  } catch (err) {
    if (!res) {
      await logSync(
        path,
        null,
        startedAt,
        err instanceof Error ? err.message : String(err),
        opts.jobIdForLog ?? null,
      );
    }
    throw err;
  }
}

// --- Types (only the fields we read; extra fields ignored) ---

export type ManatalJob = {
  id: number;
  position_name: string;
  // Manatal returns just the organization id here (not an embedded object),
  // so callers that want a name need to resolve it via listOrganizations().
  organization?: number | { id: number; name: string } | null;
  status?: string;
};

export type ManatalOrganization = {
  id: number;
  name: string;
};

export type ManatalMatch = {
  id: number;
  candidate: number | { id: number; full_name?: string };
  job?: number | { id: number };
  stage?: { id: number; name: string } | null;
  is_active?: boolean;
  full_name?: string;
};

export type ManatalCandidate = {
  id: number;
  full_name: string;
  email?: string | null;
  phone_number?: string | null;
  current_company?: string | null;
  current_position?: string | null;
  description?: string | null;
  // Top-level resume URL — present on the candidate detail when a resume is on file.
  // The URL expires after a few hours, so do NOT cache it. Use Boolean(resume) for has_resume.
  resume?: string | null;
  candidate_location?: string | null;
  custom_fields?: Record<string, unknown> | null;
};

// /candidates/{id}/social-media/ returns an ARRAY of entries, one per platform.
export type ManatalSocialMediaEntry = {
  social_media?: string;
  social_media_slug?: string;
  social_media_url?: string | null;
  social_media_data?: { url?: string | null } & Record<string, unknown>;
  username?: string | null;
};

export type ManatalAttachment = {
  id: number;
  name?: string;
  file_name?: string;
  file?: string;
  url?: string;
  created_at?: string;
};

// --- Public functions ---

// Manatal's /jobs/ endpoint silently ignores `search=` and `position_name__icontains=`
// query params (verified empirically — both return the unfiltered list). So we fetch
// all jobs and let the caller filter client-side. With typical Talental volumes
// (single-digit dozens of jobs) this is fine; revisit pagination if it grows past
// a few hundred.
export async function listJobs(): Promise<ManatalJob[]> {
  return paginate<ManatalJob>("/jobs/?page_size=100");
}

export async function listOrganizations(): Promise<ManatalOrganization[]> {
  return paginate<ManatalOrganization>("/organizations/?page_size=100");
}

async function paginate<T>(initialPath: string): Promise<T[]> {
  const all: T[] = [];
  let path: string | null = initialPath;
  while (path !== null) {
    const data: Paged<T> = await manatalFetch<Paged<T>>(path);
    all.push(...data.results);
    if (data.next) {
      const u: URL = new URL(data.next);
      path = `${u.pathname.replace("/open/v3", "")}${u.search}`;
    } else {
      path = null;
    }
  }
  return all;
}

export async function getJob(jobId: number): Promise<ManatalJob> {
  return manatalFetch<ManatalJob>(`/jobs/${jobId}/`, { jobIdForLog: jobId });
}

type Paged<T> = { next: string | null; results: T[] };

export async function listJobMatches(jobId: number): Promise<ManatalMatch[]> {
  const all: ManatalMatch[] = [];
  let path: string | null = `/jobs/${jobId}/matches/?page_size=100&is_active=true`;
  while (path !== null) {
    const data: Paged<ManatalMatch> = await manatalFetch<Paged<ManatalMatch>>(
      path,
      { jobIdForLog: jobId },
    );
    all.push(...data.results);
    if (data.next) {
      const u: URL = new URL(data.next);
      path = `${u.pathname.replace("/open/v3", "")}${u.search}`;
    } else {
      path = null;
    }
  }
  return all;
}

export async function getCandidate(candidateId: number): Promise<ManatalCandidate> {
  return manatalFetch<ManatalCandidate>(`/candidates/${candidateId}/`);
}

export async function getCandidateSocialMedia(
  candidateId: number,
): Promise<ManatalSocialMediaEntry[] | null> {
  try {
    const data = await manatalFetch<
      ManatalSocialMediaEntry[] | { results: ManatalSocialMediaEntry[] }
    >(`/candidates/${candidateId}/social-media/`);
    return Array.isArray(data) ? data : data.results ?? [];
  } catch {
    return null;
  }
}

export async function getCandidateAttachments(
  candidateId: number,
): Promise<ManatalAttachment[]> {
  try {
    const data = await manatalFetch<
      { results: ManatalAttachment[] } | ManatalAttachment[]
    >(`/candidates/${candidateId}/attachments/`);
    return Array.isArray(data) ? data : data.results ?? [];
  } catch {
    return [];
  }
}

export type ManatalExperience = {
  id?: number;
  title?: string;
  company?: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  location?: string;
} & Record<string, unknown>;

export async function getCandidateExperiences(
  candidateId: number,
): Promise<ManatalExperience[]> {
  try {
    const data = await manatalFetch<
      ManatalExperience[] | { results: ManatalExperience[] }
    >(`/candidates/${candidateId}/experiences/`);
    return Array.isArray(data) ? data : data.results ?? [];
  } catch {
    return [];
  }
}

export type ManatalEducation = {
  id?: number;
  degree?: string;
  field_of_study?: string;
  university?: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
} & Record<string, unknown>;

export async function getCandidateEducations(
  candidateId: number,
): Promise<ManatalEducation[]> {
  try {
    const data = await manatalFetch<
      ManatalEducation[] | { results: ManatalEducation[] }
    >(`/candidates/${candidateId}/educations/`);
    return Array.isArray(data) ? data : data.results ?? [];
  } catch {
    return [];
  }
}

export type ManatalResume = {
  file?: string;
  url?: string;
  download_url?: string;
};

export async function getCandidateResume(
  candidateId: number,
): Promise<ManatalResume | null> {
  try {
    return await manatalFetch<ManatalResume>(`/candidates/${candidateId}/resume/`);
  } catch {
    return null;
  }
}

export function extractLinkedinUrl(
  socialMedia: ManatalSocialMediaEntry[] | null,
  candidate: ManatalCandidate | null,
): string | null {
  if (Array.isArray(socialMedia)) {
    const linkedin = socialMedia.find(
      (e) =>
        e.social_media_slug?.toLowerCase() === "linkedin" ||
        e.social_media?.toLowerCase() === "linkedin",
    );
    if (linkedin) {
      const url =
        (typeof linkedin.social_media_url === "string" && linkedin.social_media_url) ||
        (typeof linkedin.social_media_data?.url === "string" &&
          linkedin.social_media_data.url) ||
        (typeof linkedin.username === "string" && linkedin.username
          ? `https://www.linkedin.com/in/${linkedin.username}/`
          : null);
      if (url) return url;
    }
  }
  const cf = candidate?.custom_fields;
  if (cf && typeof cf === "object") {
    for (const v of Object.values(cf)) {
      if (typeof v === "string" && /linkedin\.com\//i.test(v)) return v;
    }
  }
  return null;
}

export function extractLocation(candidate: ManatalCandidate | null): string | null {
  const v = candidate?.candidate_location;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function extractCurrentComp(candidate: ManatalCandidate | null): number | null {
  const cf = candidate?.custom_fields;
  if (!cf || typeof cf !== "object") return null;
  const raw = (cf as Record<string, unknown>).currentcomp;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function extractCurrencyAndFrequency(
  candidate: ManatalCandidate | null,
): { currency: string | null; frequency: string | null } {
  const cf = candidate?.custom_fields;
  if (!cf || typeof cf !== "object") return { currency: null, frequency: null };
  const obj = cf as Record<string, unknown>;
  const currency =
    typeof obj.currency === "string" && obj.currency.trim().length > 0
      ? obj.currency.trim()
      : null;
  const frequency =
    typeof obj.frequency === "string" && obj.frequency.trim().length > 0
      ? obj.frequency.trim()
      : null;
  return { currency, frequency };
}

export function extractDownloadUrl(
  obj: ManatalResume | ManatalAttachment | null | undefined,
): string | null {
  if (!obj) return null;
  return (
    (typeof (obj as ManatalResume).download_url === "string" &&
      (obj as ManatalResume).download_url) ||
    (typeof obj.file === "string" && obj.file) ||
    (typeof obj.url === "string" && obj.url) ||
    null
  );
}
