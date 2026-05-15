import { headers } from "next/headers";

/**
 * Resolve the canonical site URL for the current runtime.
 *
 * Strategy (in order):
 *   1. The request's own Host header — always correct because it reflects
 *      the URL the user is actually browsing (preview, prod, custom domain,
 *      localhost). Works on Vercel, Railway, self-hosted, anywhere.
 *   2. `VERCEL_ENV === "preview"` + `VERCEL_URL` as a fallback when request
 *      headers aren't available for some reason.
 *   3. `NEXT_PUBLIC_SITE_URL` as the canonical prod fallback.
 *   4. `http://localhost:3000` as a last-ditch dev fallback.
 *
 * Server-only. Must be `await`ed because `headers()` is async in Next 16.
 */
export async function siteUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ??
        (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    /* headers() may throw outside a request context — fall through. */
  }
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}
