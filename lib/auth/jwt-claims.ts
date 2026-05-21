/**
 * JWT custom-claims helper.
 *
 * The Supabase Custom Access Token Hook
 * (`public.custom_access_token_hook`) enriches access tokens with the
 * user's workspace context — `workspace_id`, `team_role`, and
 * `onboarded_at` — so middleware and server actions don't need a DB
 * round-trip to find them.
 *
 * After `supabase.auth.getUser()` (which validates the JWT against
 * Supabase) has returned, the cookie session holds a verified access
 * token. We decode its payload locally — no network, no extra
 * verification needed since `getUser` already vouched for the token.
 *
 * The decoder is best-effort: any failure or missing claim returns
 * null/undefined so callers can fall back to a DB lookup. This makes
 * the rollout safe — code works whether or not the hook is enabled
 * in the Supabase dashboard.
 */

export type CustomClaims = {
  workspace_id?: string;
  team_role?: string;
  /** ISO timestamp or null when workspace hasn't completed onboarding. */
  onboarded_at?: string | null;
};

/** Decode a JWT payload without verifying — caller must have already validated. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    // Pad to a multiple of 4 for atob compatibility.
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Read custom claims from a validated access token. Returns an empty
 * object if the token has no custom claims — caller should treat that
 * as "hook not enabled, fall back to DB lookup".
 */
export function readCustomClaims(accessToken: string | null | undefined): CustomClaims {
  if (!accessToken) return {};
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return {};
  const out: CustomClaims = {};
  if (typeof payload.workspace_id === "string") {
    out.workspace_id = payload.workspace_id;
  }
  if (typeof payload.team_role === "string") {
    out.team_role = payload.team_role;
  }
  if (
    typeof payload.onboarded_at === "string" ||
    payload.onboarded_at === null
  ) {
    out.onboarded_at = payload.onboarded_at as string | null;
  }
  return out;
}
