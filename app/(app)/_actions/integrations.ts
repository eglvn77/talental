"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/team";
import { getCurrentUser } from "@/lib/auth/session";
import { getRequestWorkspaceId } from "@/lib/hiring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";
import {
  createHostedAuthLink,
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

  const redirectUri = `${await siteUrl()}/api/unipile/callback`;
  try {
    const { url } = await createHostedAuthLink({
      userId: me.id,
      providers: [provider],
      successUrl: redirectUri,
      failureUrl: redirectUri,
      notifyUrl: redirectUri,
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
