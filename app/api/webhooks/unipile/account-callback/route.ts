import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAccount, mapUnipileStatus } from "@/lib/integrations/unipile/client";
import type { ConnectedAccountProvider } from "@/lib/hiring";

/**
 * Unipile account-callback webhook.
 *
 * Fired by Unipile when:
 *   - A user finishes the Hosted Auth wizard (account created)
 *   - An existing account changes status (re-auth needed, expired, etc.)
 *
 * Payload shape (from Unipile docs):
 *   {
 *     status: "CREATION_SUCCESS" | "RECONNECTED" | "DISCONNECTED" | ...
 *     account_id: "<unipile-account-id>",
 *     name: "<the user_id we passed when creating the hosted-auth link>"
 *   }
 *
 * Behaviour:
 *   - Use `name` to resolve back to our ATS user → workspace_id
 *   - Fetch the full account from Unipile to get provider + metadata
 *   - Upsert hiring.connected_accounts on (user_id, provider) so
 *     reconnecting the same provider replaces the row instead of
 *     duplicating.
 *
 * Auth: no header check. The endpoint is public because Unipile
 * doesn't sign webhooks. Mitigations:
 *   - We immediately verify the account_id against Unipile's API
 *     (so a forged callback for a non-existent account is rejected).
 *   - The `name` field is the recruiter's user_id from our DB —
 *     if it doesn't match a real row, we 404.
 *   - We use the SERVICE client (RLS bypass) intentionally so this
 *     webhook can write without a Supabase session.
 */

interface UnipileWebhookBody {
  status?: string;
  account_id?: string;
  name?: string;
  AccountStatus?: string; // newer Unipile versions camel-case some fields
  AccountId?: string;
}

export async function POST(req: NextRequest) {
  let body: UnipileWebhookBody;
  let rawText = "";
  try {
    rawText = await req.text();
    body = JSON.parse(rawText) as UnipileWebhookBody;
  } catch (e) {
    console.error("[unipile webhook] invalid JSON. raw body:", rawText, e);
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Log the full body so when something goes wrong we can see what
  // Unipile actually sent us.
  console.log("[unipile webhook] received:", JSON.stringify(body));

  const accountId = body.account_id ?? body.AccountId;
  const userId = body.name; // we passed userId as `name` in the hosted-auth link
  const incomingStatus = body.status ?? body.AccountStatus ?? "";

  if (!accountId || !userId) {
    console.error(
      "[unipile webhook] missing account_id or name. body:",
      JSON.stringify(body),
    );
    return NextResponse.json(
      { ok: false, error: "Missing account_id or name" },
      { status: 400 },
    );
  }

  // Step 1: Verify the account is real by fetching it from Unipile.
  // This rejects forged webhooks since a fake account_id won't exist.
  let unipileAccount;
  try {
    unipileAccount = await getAccount(accountId);
    console.log(
      "[unipile webhook] account fetched:",
      JSON.stringify(unipileAccount),
    );
  } catch (e) {
    console.error("[unipile webhook] getAccount failed:", e);
    return NextResponse.json(
      { ok: false, error: "Unknown account_id" },
      { status: 404 },
    );
  }

  type AccountShape = {
    type?: string;
    sources?: Array<{ status?: string; [k: string]: unknown }>;
    connection_params?: unknown;
    params?: unknown;
    profile?: unknown;
  };
  const acc = unipileAccount as AccountShape;
  const provider = (acc.type ?? "").toUpperCase() as ConnectedAccountProvider;
  const sources = acc.sources;
  const firstSourceStatus = Array.isArray(sources) && sources.length > 0
    ? sources[0]?.status
    : undefined;
  const status = mapUnipileStatus(incomingStatus || firstSourceStatus || "");

  // Step 2: Resolve workspace_id from the user.
  const sb = getSupabaseAdmin();
  const { data: teamMember } = await sb
    .schema("hiring")
    .from("team_members")
    .select("id, workspace_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (!teamMember) {
    console.error(
      "[unipile webhook] team_member not found for auth_user_id:",
      userId,
    );
    return NextResponse.json(
      { ok: false, error: "User not in any workspace" },
      { status: 404 },
    );
  }
  console.log(
    "[unipile webhook] team_member resolved:",
    JSON.stringify(teamMember),
    "provider:",
    provider,
    "status:",
    status,
  );

  // Step 3: Build the account_metadata snapshot. For LinkedIn, Unipile
  // exposes the public_id + display name + headline in the response.
  const metadata: Record<string, unknown> = {
    type: acc.type,
  };
  if (Array.isArray(sources) && sources.length > 0) {
    metadata.sources = sources;
  }
  const params = acc.connection_params ?? acc.params ?? null;
  if (params) metadata.connection_params = params;
  if (acc.profile) metadata.profile = acc.profile;

  // Step 4: Upsert on (user_id, provider).
  const { error } = await sb
    .schema("hiring")
    .from("connected_accounts")
    .upsert(
      {
        user_id: (teamMember as { id: string }).id,
        workspace_id: (teamMember as { workspace_id: string }).workspace_id,
        provider,
        unipile_account_id: accountId,
        status,
        last_status_update: new Date().toISOString(),
        account_metadata: metadata,
      },
      { onConflict: "user_id,provider" },
    );

  if (error) {
    console.error("[unipile webhook] upsert failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message.slice(0, 300) },
      { status: 500 },
    );
  }

  console.log(
    "[unipile webhook] connected_account upserted successfully for workspace",
    (teamMember as { workspace_id: string }).workspace_id,
  );
  return NextResponse.json({ ok: true, status });
}
