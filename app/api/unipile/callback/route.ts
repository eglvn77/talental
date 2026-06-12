/**
 * Unipile Hosted-Auth redirect target.
 *
 * After the admin finishes the Hosted-Auth wizard, Unipile redirects
 * the browser here (the `redirect_uri` we set in connectChannelAction)
 * with `account_id` + provider on success, or `error`/`error_type` on
 * failure. Because it's a top-level navigation back to our own domain,
 * the admin's ATS session cookie rides along — so we resolve the
 * workspace from the session, fetch the account's metadata from
 * Unipile, and upsert it into hiring.connected_accounts. From that
 * moment the messaging webhook can resolve a workspace for the
 * account's inbound messages and they flow into Conversations.
 *
 * SERVICE ROLE: connected_accounts is RLS-scoped; we write via service
 * role after validating the session + deriving the workspace from it.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAccount, mapUnipileStatus } from "@/lib/integrations/unipile/client";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function settingsRedirect(base: string, params: Record<string, string>) {
  const url = new URL("/settings/integrations", base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: Request): Promise<NextResponse> {
  const base = await siteUrl();
  const sp = new URL(req.url).searchParams;

  // Failure path — Unipile passes error / error_type when the user
  // bailed or the provider denied. Bounce back with a flag.
  const err = sp.get("error") ?? sp.get("error_type");
  if (err) {
    return settingsRedirect(base, { error: err.slice(0, 60) });
  }

  const accountId = sp.get("account_id") ?? sp.get("accountId");
  if (!accountId) {
    return settingsRedirect(base, { error: "no_account" });
  }

  // Resolve the workspace from the (still-present) ATS session.
  const me = await getCurrentUser();
  if (!me) {
    const login = new URL("/login", base);
    login.searchParams.set("next", "/settings/integrations");
    return NextResponse.redirect(login);
  }

  try {
    const acc = await getAccount(accountId);
    const provider = (acc.type ?? "").toUpperCase();
    const metadata: Record<string, unknown> = {};
    if (acc.email) metadata.email = acc.email;
    if (acc.phone) metadata.phone = acc.phone;
    if (acc.public_id) metadata.public_id = acc.public_id;
    if (acc.name) metadata.name = acc.name;
    const status = mapUnipileStatus(String(acc.status ?? "OK"));

    const db = getSupabaseAdmin().schema("hiring");
    // unipile_account_id is globally unique — upsert so a reconnect
    // updates the existing row instead of erroring.
    const { data: existing } = await db
      .from("connected_accounts")
      .select("id")
      .eq("unipile_account_id", accountId)
      .maybeSingle();
    if (existing) {
      await db
        .from("connected_accounts")
        .update({
          provider,
          status,
          account_metadata: metadata,
          last_status_update: new Date().toISOString(),
        })
        .eq("id", existing.id as string);
    } else {
      await db.from("connected_accounts").insert({
        user_id: me.id,
        workspace_id: me.workspace.id,
        provider,
        unipile_account_id: accountId,
        status,
        account_metadata: metadata,
      });
    }
    return settingsRedirect(base, { connected: provider });
  } catch (e) {
    console.error("[unipile callback] failed:", e);
    return settingsRedirect(base, { error: "seed_failed" });
  }
}
