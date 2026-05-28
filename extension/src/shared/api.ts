import { getBackendUrl } from "./config";

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
    }
  | { ok: false; error: string; status?: number };

/**
 * POST a LinkedIn URL to the ATS for saving + enrichment. Sends
 * cookies so the user's existing Supabase session authenticates the
 * request (extension declares host_permissions for the backend in
 * the manifest, so the browser treats this as a first-party request
 * for cookie purposes).
 */
export async function saveLink(url: string): Promise<SaveLinkResult> {
  const base = await getBackendUrl();
  try {
    const res = await fetch(`${base}/api/extension/save-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ url }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      return {
        ok: false,
        error: typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
        status: res.status,
      };
    }
    return json as SaveLinkResult;
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
