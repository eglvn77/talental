"use server";

import type {
  PortalAllowedEmailRow,
  PortalSessionRow,
  PortalTokenRow,
} from "@/lib/hiring";
import { requireAdmin } from "@/lib/auth/team";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function adminDb() {
  return getSupabaseAdmin().schema("hiring");
}

/**
 * Lists portal tokens for one company (scope='company') along with
 * recent viewer sessions and the per-token allowed-email whitelist.
 */
export async function listCompanyPortalTokensAction(input: {
  companyId: string;
}): Promise<
  ActionResult<{
    siteUrl: string;
    tokens: PortalTokenRow[];
    sessionsByToken: Record<string, PortalSessionRow[]>;
    allowedByToken: Record<string, PortalAllowedEmailRow[]>;
  }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = adminDb();
  const { data: tokens, error } = await db
    .from("portal_tokens")
    .select("*")
    .eq("scope", "company")
    .eq("company_id", input.companyId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  const tokenRows = (tokens ?? []) as PortalTokenRow[];
  const sessionsByToken: Record<string, PortalSessionRow[]> = {};
  const allowedByToken: Record<string, PortalAllowedEmailRow[]> = {};
  if (tokenRows.length > 0) {
    const ids = tokenRows.map((r) => r.id);
    const [{ data: sessions }, { data: allowed }] = await Promise.all([
      db
        .from("portal_sessions")
        .select("*")
        .in("token_id", ids)
        .order("last_seen_at", { ascending: false })
        .limit(50),
      db
        .from("portal_allowed_emails")
        .select("*")
        .in("token_id", ids)
        .order("created_at", { ascending: true }),
    ]);
    for (const s of (sessions ?? []) as PortalSessionRow[]) {
      (sessionsByToken[s.token_id] ??= []).push(s);
    }
    for (const a of (allowed ?? []) as PortalAllowedEmailRow[]) {
      (allowedByToken[a.token_id] ??= []).push(a);
    }
  }

  return {
    ok: true,
    data: {
      siteUrl: await siteUrl(),
      tokens: tokenRows,
      sessionsByToken,
      allowedByToken,
    },
  };
}
