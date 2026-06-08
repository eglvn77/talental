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
    console.error("[integrations sync] listAccounts failed:", e);
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Couldn't reach Unipile",
    };
  }
  const accounts = accountsResp.items ?? [];
  console.log(
    "[integrations sync] Unipile returned",
    accounts.length,
    "accounts. Names:",
    accounts.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      email: a.email,
    })),
  );
  console.log("[integrations sync] Our auth_user_id:", me.id);

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
  const allMemberIds = (members ?? []).map(
    (m) => (m as { id: string }).id,
  );

  // Pre-load existing rows by unipile_account_id so we can do a
  // re-sync match even when the original `name` field has been
  // overwritten by Unipile's display name.
  const sb = getSupabaseAdmin();
  const accountIds = accounts.map((a) => a.id);
  const { data: existingRows } = accountIds.length
    ? await sb
        .schema("hiring")
        .from("connected_accounts")
        .select("user_id, unipile_account_id")
        .in("unipile_account_id", accountIds)
    : { data: [] as Array<{ user_id: string; unipile_account_id: string }> };
  const ownerByAccountId = new Map<string, string>();
  for (const r of (existingRows ?? []) as Array<{
    user_id: string;
    unipile_account_id: string;
  }>) {
    ownerByAccountId.set(r.unipile_account_id, r.user_id);
  }

  let synced = 0;
  for (const acc of accounts) {
    // Three-tier ownership resolution (most-specific → fallback):
    //   1. acc.name matches a team_member's auth_user_id (works
    //      when Unipile preserved the hosted-auth link's `name`
    //      field on the account record).
    //   2. The account already has a row in our DB → reuse that
    //      row's user_id (works for re-syncs).
    //   3. Single-user workspace → assume it's ours. Pragmatic
    //      for Talental (customer #1); will need a better strategy
    //      when atese.ai multi-tenants ship.
    let memberId: string | undefined;
    if (acc.name) memberId = memberByAuthId.get(acc.name);
    if (!memberId) memberId = ownerByAccountId.get(acc.id);
    if (!memberId && allMemberIds.length === 1) {
      memberId = allMemberIds[0];
    }
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

  // Don't revalidatePath here — this action is called server-side
  // during the page render, and Next 16 rejects revalidate calls
  // during render. The page reads connected_accounts AFTER we
  // upsert, so it sees the fresh data without needing revalidation.
  // If a client component (the AccountCard's Refresh button) calls
  // this, it should revalidate itself after awaiting the result.
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
