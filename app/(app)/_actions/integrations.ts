"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/team";
import { getCurrentUser } from "@/lib/auth/session";
import { getRequestWorkspaceId } from "@/lib/hiring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";
import {
  createHostedAuthLink,
  listAccounts,
  mapUnipileStatus,
  type HostedAuthProvider,
} from "@/lib/integrations/unipile/client";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Channel connections (LinkedIn / Gmail / WhatsApp …) live in
 * hiring.connected_accounts and power BOTH the Conversations inbox
 * (inbound monitoring via the Unipile webhook) and Sequences sending.
 * These actions drive the Settings → Integrations page: generate a
 * Unipile Hosted-Auth link to connect/reconnect, and remove an
 * account to stop monitoring it.
 *
 * connected_accounts is RLS-scoped per workspace; we use the
 * service-role client and gate every action with requireAdmin() +
 * explicit workspace scoping (same pattern as portal-tokens.ts).
 */
function adminDb() {
  return getSupabaseAdmin().schema("hiring");
}

/**
 * Provider keys we expose as connect buttons, mapped to the value
 * Unipile's Hosted-Auth wizard expects. Gmail goes through "GOOGLE";
 * Unipile then reports the connected account back as "GOOGLE_OAUTH",
 * which the callback persists verbatim.
 */
const WIZARD_PROVIDER: Record<string, HostedAuthProvider> = {
  linkedin: "LINKEDIN",
  gmail: "GOOGLE",
  whatsapp: "WHATSAPP",
  outlook: "OUTLOOK",
};

/**
 * Generate a one-time Unipile Hosted-Auth URL for the admin to connect
 * (or reconnect) a channel. The client opens the returned URL; after
 * the user finishes Unipile redirects back to /api/unipile/callback,
 * which seeds the account into connected_accounts for this workspace.
 */
export async function connectChannelAction(input: {
  channel: "linkedin" | "gmail" | "whatsapp" | "outlook";
  /** Pass an existing unipile_account_id to drive the reconnect flow. */
  reconnectAccountId?: string;
}): Promise<ActionResult<{ url: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };
  const provider = WIZARD_PROVIDER[input.channel];
  if (!provider) return { ok: false, error: "Canal no soportado" };

  // v1 Hosted Auth delivers the connected account two ways: a
  // server-to-server POST to notify_url (reliable, carries our `name`
  // = userId), and a browser redirect to success/failure_redirect_url.
  // The notify webhook does the seeding (guarded by the shared secret);
  // the browser just lands back on the settings page.
  const base = await siteUrl();
  const secret = process.env.UNIPILE_WEBHOOK_SECRET ?? "";
  try {
    const { url } = await createHostedAuthLink({
      userId: me.id,
      providers: [provider],
      successUrl: `${base}/settings/integrations?connected=1`,
      failureUrl: `${base}/settings/integrations?error=auth`,
      notifyUrl: `${base}/api/unipile/callback?secret=${encodeURIComponent(secret)}`,
      reconnectAccountId: input.reconnectAccountId,
    });
    return { ok: true, data: { url } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : "Unipile error",
    };
  }
}

/**
 * Pull every account from Unipile and upsert it into
 * connected_accounts for this workspace. This is the reliable seeding
 * path: the Hosted-Auth notify webhook can be flaky (the connection
 * shows in Unipile + on the phone, but the callback never fires), so
 * the page runs this on return from the wizard and the admin can also
 * trigger it manually. Idempotent — upsert keys on unipile_account_id.
 */
export async function syncChannelsAction(): Promise<
  ActionResult<{ synced: number }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };
  const db = adminDb();
  try {
    const { items } = await listAccounts();
    let synced = 0;
    for (const acc of items) {
      const provider = (acc.type ?? "").toUpperCase();
      if (!provider) continue;
      const metadata: Record<string, unknown> = {};
      if (acc.email) metadata.email = acc.email;
      if (acc.phone) metadata.phone = acc.phone;
      if (acc.public_id) metadata.public_id = acc.public_id;
      if (acc.name) metadata.name = acc.name;
      const status = mapUnipileStatus(String(acc.status ?? "OK"));
      const { data: existing } = await db
        .from("connected_accounts")
        .select("id")
        .eq("unipile_account_id", acc.id)
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
          unipile_account_id: acc.id,
          status,
          account_metadata: metadata,
        });
      }
      synced++;
    }
    revalidatePath("/settings/integrations");
    return { ok: true, data: { synced } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : "Unipile error",
    };
  }
}

/**
 * Stop monitoring an account: removes the connected_accounts row so the
 * webhook no longer resolves a workspace for its inbound messages.
 * Scoped to the caller's workspace. The Unipile-side connection is left
 * intact (the admin can reconnect later, or delete it in Unipile).
 */
export async function disconnectChannelAction(input: {
  accountRowId: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = adminDb();
  const { error } = await db
    .from("connected_accounts")
    .delete()
    .eq("id", input.accountRowId)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/integrations");
  return { ok: true };
}
