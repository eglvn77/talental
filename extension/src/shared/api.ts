import { getBackendUrl } from "./config";

/**
 * Thin REST client for the three endpoints under /api/extension/*.
 * All call paths send cookies (Supabase session) — works because the
 * manifest declares host_permissions for the backend host, so the
 * browser treats these calls as first-party for cookie purposes.
 *
 * Endpoints (kept in sync with app/api/extension/*):
 *   GET  /check?url=...     → does this LinkedIn URL exist in ATS?
 *   GET  /jobs              → workspace's open jobs for the picker
 *   POST /save-link         → save (+ optional scraped_data + job_id)
 */

export type CheckResult =
  | {
      ok: true;
      exists: true;
      kind: "candidate" | "company";
      id: string;
      name: string | null;
      linkedin_url: string;
    }
  | { ok: true; exists: false }
  | { ok: false; error: string; status?: number };

export type JobOption = {
  id: string;
  title: string;
  company_name: string | null;
};

export type JobsResult =
  | { ok: true; jobs: JobOption[] }
  | { ok: false; error: string; status?: number };

export type ScrapedProfile = {
  full_name?: string | null;
  headline?: string | null;
  current_title?: string | null;
  current_company?: string | null;
  location?: string | null;
  about?: string | null;
};

export type SaveLinkResult =
  | {
      ok: true;
      kind: "candidate" | "company";
      id: string;
      name: string;
      linkedin_url: string;
      domain?: string | null;
      email?: string | null;
      cacheHit: boolean;
      creditsUsed: number;
      enrichment_source?: "coresignal" | "scraped_fallback";
      application_id?: string | null;
      job_id?: string | null;
    }
  | { ok: false; error: string; status?: number };

async function call<T>(
  path: string,
  init: RequestInit,
  errPrefix = "",
): Promise<T | { ok: false; error: string; status?: number }> {
  const base = await getBackendUrl();
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof json.error === "string"
            ? json.error
            : `${errPrefix}HTTP ${res.status}`,
        status: res.status,
      };
    }
    return json as T;
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Red: ${e.message}`
          : "No se pudo conectar al ATS.",
    };
  }
}

/** GET /api/extension/check — does the URL exist in workspace? */
export async function checkProfile(url: string): Promise<CheckResult> {
  return call<CheckResult>(
    `/api/extension/check?url=${encodeURIComponent(url)}`,
    { method: "GET" },
  );
}

/** GET /api/extension/jobs — workspace's open jobs for the picker. */
export async function getJobs(): Promise<JobsResult> {
  return call<JobsResult>(`/api/extension/jobs`, { method: "GET" });
}

/**
 * POST /api/extension/save-link — save candidate/company.
 * Optionally include the DOM-scraped fallback (for Coresignal 404s)
 * and a target job_id (creates the application at the job's first
 * stage).
 */
export async function saveLink(
  url: string,
  opts?: { scrapedData?: ScrapedProfile | null; jobId?: string | null },
): Promise<SaveLinkResult> {
  return call<SaveLinkResult>(`/api/extension/save-link`, {
    method: "POST",
    body: JSON.stringify({
      url,
      scraped_data: opts?.scrapedData ?? null,
      job_id: opts?.jobId ?? null,
    }),
  });
}
