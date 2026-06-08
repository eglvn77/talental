// MV3 service worker — single fetch dispatcher for the whole
// extension. Both the content script (LinkedIn pages) and the popup
// route their API calls through here via chrome.runtime.sendMessage.
//
// Why: content scripts run in the host page's origin context (e.g.
// https://www.linkedin.com). When that origin tries to fetch our
// backend with credentials:include, the browser requires the
// Access-Control-Allow-Origin response header to be an explicit
// origin string, not "*". Our endpoints only emit the explicit
// origin for chrome-extension:// callers. So a content-script fetch
// would CORS-fail with "Failed to fetch" — even though the popup
// (which IS a chrome-extension:// origin) works fine.
//
// Routing through this service worker fixes it: the SW's origin is
// chrome-extension://<id>, so the request goes out with that origin,
// the backend echoes it back in Allow-Origin, and credentials flow
// correctly.

import { DEFAULT_BACKEND_URL, STORAGE_KEY_BACKEND } from "../shared/config";

chrome.runtime.onInstalled.addListener(() => {
  // Seed default backend URL on first install so the popup picker
  // shows something instead of being empty.
  chrome.storage.local.get([STORAGE_KEY_BACKEND], (res) => {
    if (!res[STORAGE_KEY_BACKEND]) {
      chrome.storage.local.set({ [STORAGE_KEY_BACKEND]: DEFAULT_BACKEND_URL });
    }
  });
});

// ── Fetch dispatcher ────────────────────────────────────────

type ApiRequest =
  | { kind: "check"; url: string }
  | { kind: "jobs" }
  | {
      kind: "save";
      url: string;
      scrapedData: unknown;
      jobId: string | null;
    }
  | { kind: "ping" };

type ApiResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string; status?: number };

async function getBackend(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_BACKEND], (res) => {
      const v = res[STORAGE_KEY_BACKEND];
      resolve(
        typeof v === "string" && v.trim()
          ? v.replace(/\/+$/, "")
          : DEFAULT_BACKEND_URL,
      );
    });
  });
}

async function doFetch(req: ApiRequest): Promise<ApiResponse> {
  const base = await getBackend();
  try {
    let res: Response;
    switch (req.kind) {
      case "check":
        res = await fetch(
          `${base}/api/extension/check?url=${encodeURIComponent(req.url)}`,
          { method: "GET", credentials: "include" },
        );
        break;
      case "jobs":
        res = await fetch(`${base}/api/extension/jobs`, {
          method: "GET",
          credentials: "include",
        });
        break;
      case "save":
        res = await fetch(`${base}/api/extension/save-link`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: req.url,
            scraped_data: req.scrapedData ?? null,
            job_id: req.jobId ?? null,
          }),
        });
        break;
      case "ping":
        // Auth probe — POST with invalid body so we only care about
        // 401 (no session) vs anything else (logged in).
        res = await fetch(`${base}/api/extension/save-link`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "ping" }),
        });
        break;
    }
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
        status: res.status,
      };
    }
    return { ok: true, data: json };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Red: ${e.message}` : "Sin conexión.",
    };
  }
}

chrome.runtime.onMessage.addListener(
  (msg: ApiRequest, _sender, sendResponse) => {
    // MV3 quirk: must return true to keep the channel open for async
    // sendResponse. Otherwise sendResponse fires after the channel
    // already closed and the caller hangs.
    void doFetch(msg).then(sendResponse);
    return true;
  },
);
