/**
 * Thin chrome.runtime.sendMessage wrapper. All actual HTTP fetches
 * happen in the background service worker — that's the only place
 * the origin is chrome-extension://<id>, which is what the backend's
 * CORS rules require for credentials:include.
 *
 * Callers (content script + popup) shouldn't fetch directly. They
 * send a typed request to the background, which returns
 * { ok:true, data } or { ok:false, error, status? }.
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

type BgResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number };

function sendBg<T>(msg: unknown): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res: BgResponse | undefined) => {
      if (chrome.runtime.lastError || !res) {
        resolve({
          ok: false,
          error:
            chrome.runtime.lastError?.message ?? "No respuesta del background.",
        } as unknown as T);
        return;
      }
      if (!res.ok) {
        resolve({
          ok: false,
          error: res.error,
          status: res.status,
        } as unknown as T);
        return;
      }
      resolve(res.data as T);
    });
  });
}

export async function checkProfile(url: string): Promise<CheckResult> {
  return sendBg<CheckResult>({ kind: "check", url });
}

export async function getJobs(): Promise<JobsResult> {
  return sendBg<JobsResult>({ kind: "jobs" });
}

export async function saveLink(
  url: string,
  opts?: { scrapedData?: ScrapedProfile | null; jobId?: string | null },
): Promise<SaveLinkResult> {
  return sendBg<SaveLinkResult>({
    kind: "save",
    url,
    scrapedData: opts?.scrapedData ?? null,
    jobId: opts?.jobId ?? null,
  });
}

/**
 * Auth probe used by the popup status indicator. The backend
 * returns 401 if not logged in, anything else (400 for invalid url,
 * 200, etc.) means the session cookie is valid.
 */
export async function pingAuth(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const res = await sendBg<{ ok: boolean; error?: string; status?: number }>({
    kind: "ping",
  });
  if (!res.ok && res.status === 401) {
    return { ok: false, error: "Sin sesión." };
  }
  return { ok: true };
}
