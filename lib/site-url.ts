/**
 * Resolve the canonical site URL for the current runtime.
 *
 * Priority:
 *   1. Vercel preview deploy → use VERCEL_URL so the auth callbacks (OAuth,
 *      magic-link, password reset, signup confirmation) land back on the
 *      preview deploy instead of bouncing to production.
 *   2. NEXT_PUBLIC_SITE_URL → production (or any env that explicitly sets
 *      a canonical URL, e.g. localhost when developing).
 *   3. Fallback to http://localhost:3000 for safety.
 *
 * Server-only. `VERCEL_URL` and `VERCEL_ENV` are not exposed to the client
 * by default; this helper is meant for server actions and route handlers.
 */
export function siteUrl(): string {
  if (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_URL
  ) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}
