"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { hiring } from "@/lib/hiring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  listAccounts,
  mapUnipileStatus,
} from "@/lib/integrations/unipile/client";
import type { ConnectedAccountProvider } from "@/lib/hiring";

type Result =
  | { ok: true; synced: number }
  | { ok: false; error: string };

/**
 * Sync the workspace's connected accounts from Unipile. The
 * Unipile webhook *should* keep this in sync automatically, but
 * webhook delivery is unreliable enough that we explicitly re-sync
 * on every /settings/integrations load. This means the page always
 * reflects what Unipile actually knows, not a stale cached row.
 *
 * How the mapping works:
 *   - We listAccounts() from Unipile (all accounts in this tenant)
 *   - Each account has a `name` field — that's the auth_user_id we
 *     passed when minting the hosted-auth link
 *   - For each account where `name` matches a team_member in this
 *     workspace, we upsert (user_id, provider) → connected_accounts
 */
export async function syncConnectedAccountsAction(): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };

  let accountsResp;
  try {
    accountsResp = await listAccounts();
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Couldn't reach Unipile",
    };
  }
  const accounts = accountsResp.items ?? [];

  // Resolve all team_members for this workspace in one query so we
  // can map auth_user_id → team_member.id without N+1.
  const db = await hiring();
  const { data: members } = await db
    .from("team_members")
    .select("id, auth_user_id")
    .eq("workspace_id", me.workspace.id);
  const memberByAuthId = new Map<string, string>();
  for (const m of (members ?? []) as Array<{
    id: string;
    auth_user_id: string;
  }>) {
    memberByAuthId.set(m.auth_user_id, m.id);
  }

  // Admin client bypasses RLS for the upsert.
  const sb = getSupabaseAdmin();
  let synced = 0;
  for (const acc of accounts) {
    if (!acc.name) continue;
    const memberId = memberByAuthId.get(acc.name);
    if (!memberId) continue;
    const provider = (acc.type ?? "").toUpperCase() as ConnectedAccountProvider;
    if (!provider) continue;
    const sources = (acc as { sources?: Array<{ status?: string }> }).sources;
    const firstSourceStatus =
      Array.isArray(sources) && sources.length > 0
        ? sources[0]?.status
        : undefined;
    const status = mapUnipileStatus(acc.status || firstSourceStatus || "");

    const metadata: Record<string, unknown> = {
      type: acc.type,
      name: acc.name,
    };
    if (acc.email) metadata.email = acc.email;
    if (acc.phone) metadata.phone = acc.phone;
    if (acc.public_id) metadata.public_id = acc.public_id;
    if (Array.isArray(sources)) metadata.sources = sources;
    const params = (acc as { connection_params?: unknown }).connection_params;
    if (params) metadata.connection_params = params;
    const profile = (acc as { profile?: unknown }).profile;
    if (profile) metadata.profile = profile;

    const { error } = await sb
      .schema("hiring")
      .from("connected_accounts")
      .upsert(
        {
          user_id: memberId,
          workspace_id: me.workspace.id,
          provider,
          unipile_account_id: acc.id,
          status,
          last_status_update: new Date().toISOString(),
          account_metadata: metadata,
        },
        { onConflict: "user_id,provider" },
      );
    if (error) {
      console.error("[integrations] upsert failed:", error);
      continue;
    }
    synced++;
  }

  revalidatePath("/settings/integrations");
  return { ok: true, synced };
}

/**
 * Disconnect a single account in our DB. Doesn't delete from
 * Unipile — recruiter can reconnect quickly without losing
 * Unipile-side history. If they want to nuke it for real, they go
 * to the Unipile dashboard.
 */
export async function disconnectAccountAction(
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };
  if (!accountId) return { ok: false, error: "Missing accountId" };

  const db = await hiring();
  const { error } = await db
    .from("connected_accounts")
    .delete()
    .eq("workspace_id", me.workspace.id)
    .eq("id", accountId);
  if (error) {
    return { ok: false, error: error.message.slice(0, 300) };
  }

  revalidatePath("/settings/integrations");
  return { ok: true };
}
