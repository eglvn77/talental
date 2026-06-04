"use server";

import { hiring } from "@/lib/hiring";
import type { PortalSessionRow, PortalTokenRow } from "@/lib/hiring";
import { requireAdmin } from "@/lib/auth/team";
import { siteUrl } from "@/lib/site-url";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * List portal tokens for one company (scope='company') and recent
 * sessions per token. Used by the Portal tab inside the company
 * slideover, which fetches lazily on mount.
 */
export async function listCompanyPortalTokensAction(input: {
  companyId: string;
}): Promise<
  ActionResult<{
    siteUrl: string;
    tokens: PortalTokenRow[];
    sessionsByToken: Record<string, PortalSessionRow[]>;
  }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
  const { data: tokens, error } = await db
    .from("portal_tokens")
    .select("*")
    .eq("scope", "company")
    .eq("company_id", input.companyId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  const tokenRows = (tokens ?? []) as PortalTokenRow[];
  const sessionsByToken: Record<string, PortalSessionRow[]> = {};
  if (tokenRows.length > 0) {
    const { data: sessions } = await db
      .from("portal_sessions")
      .select("*")
      .in("token_id", tokenRows.map((r) => r.id))
      .order("last_seen_at", { ascending: false })
      .limit(50);
    for (const s of (sessions ?? []) as PortalSessionRow[]) {
      (sessionsByToken[s.token_id] ??= []).push(s);
    }
  }

  return {
    ok: true,
    data: { siteUrl: await siteUrl(), tokens: tokenRows, sessionsByToken },
  };
}
