import "server-only";
import { cookies, headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PortalSessionRow, PortalTokenRow } from "@/lib/hiring";

const COOKIE_NAME = "portal_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

type CookiePayload = {
  tokenId: string;
  sessionId: string;
  email: string;
};

function encode(p: CookiePayload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}
function decode(raw: string): CookiePayload | null {
  try {
    const obj = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<CookiePayload>;
    if (!obj.tokenId || !obj.sessionId || !obj.email) return null;
    return obj as CookiePayload;
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(e: string): boolean {
  return EMAIL_RE.test(e.trim());
}

/**
 * Read the current portal session cookie. Returns null if absent, malformed,
 * or scoped to a different token than the one currently being viewed.
 */
export async function readPortalSession(
  token: PortalTokenRow,
): Promise<CookiePayload | null> {
  const c = await cookies();
  const raw = c.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const payload = decode(raw);
  if (!payload) return null;
  if (payload.tokenId !== token.id) return null;
  return payload;
}

/**
 * Create (or reuse) a portal_session row for {token, email}, set the
 * httpOnly cookie, and bump last_seen_at. Idempotent per (token, email).
 */
export async function startPortalSession(
  token: PortalTokenRow,
  email: string,
): Promise<PortalSessionRow> {
  const clean = email.trim().toLowerCase();
  const sb = getSupabaseAdmin();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = h.get("user-agent") ?? null;

  // Reuse if a row already exists for (token, email) — bump last_seen_at.
  const { data: existing } = await sb
    .schema("hiring")
    .from("portal_sessions")
    .select("*")
    .eq("token_id", token.id)
    .eq("email", clean)
    .maybeSingle();

  let row: PortalSessionRow;
  if (existing) {
    const { data: updated } = await sb
      .schema("hiring")
      .from("portal_sessions")
      .update({ last_seen_at: new Date().toISOString(), ip, user_agent: ua })
      .eq("id", (existing as PortalSessionRow).id)
      .select("*")
      .single();
    row = (updated ?? existing) as PortalSessionRow;
  } else {
    const { data: inserted, error } = await sb
      .schema("hiring")
      .from("portal_sessions")
      .insert({
        token_id: token.id,
        email: clean,
        ip,
        user_agent: ua,
      })
      .select("*")
      .single();
    if (error || !inserted) {
      throw new Error(error?.message ?? "Could not start portal session");
    }
    row = inserted as PortalSessionRow;
  }

  const c = await cookies();
  c.set(COOKIE_NAME, encode({ tokenId: token.id, sessionId: row.id, email: clean }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return row;
}

/** Clear the cookie — used by a future "switch identity" flow. */
export async function clearPortalSession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}
