/**
 * Unipile Hosted-Auth delivery target. Two entry points:
 *
 *  - POST (notify_url): Unipile's server-to-server callback fired when
 *    an account finishes connecting. This is the reliable path — it
 *    carries `name` (the ATS user id we set) so we can resolve the
 *    workspace without a browser session. Guarded by the shared
 *    UNIPILE_WEBHOOK_SECRET passed as a query param.
 *
 *  - GET (browser redirect): the success/failure redirect points
 *    straight at /settings/integrations, so this GET is only hit if a
 *    Unipile variant appends ?account_id to the redirect. When it does,
 *    we seed using the still-present ATS session as a belt-and-suspenders
 *    fallback; otherwise we just bounce to the settings page.
 *
 * SERVICE ROLE: connected_accounts is RLS-scoped; we write via service
 * role after resolving the workspace (from `name` on POST, or the
 * session on GET).
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAccount, mapUnipileStatus } from "@/lib/integrations/unipile/client";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function secretOk(provided: string | null): boolean {
  const expected = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Fetch the account from Unipile and upsert it for `workspaceId`. */
async function seedAccount(
  accountId: string,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const acc = await getAccount(accountId);
  const provider = (acc.type ?? "").toUpperCase();
  const metadata: Record<string, unknown> = {};
  if (acc.email) metadata.email = acc.email;
  if (acc.phone) metadata.phone = acc.phone;
  if (acc.public_id) metadata.public_id = acc.public_id;
  if (acc.name) metadata.name = acc.name;
  const status = mapUnipileStatus(String(acc.status ?? "OK"));

  const db = getSupabaseAdmin().schema("hiring");
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
      user_id: userId,
      workspace_id: workspaceId,
      provider,
      unipile_account_id: accountId,
      status,
      account_metadata: metadata,
    });
  }
}

/** notify_url — server-to-server. Resolve workspace from `name` (userId). */
export async function POST(req: Request): Promise<NextResponse> {
  const sp = new URL(req.url).searchParams;
  if (!secretOk(sp.get("secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* tolerate empty/non-JSON */
  }
  const accountId =
    (body.account_id as string | undefined) ??
    (body.account as string | undefined) ??
    null;
  const userId = (body.name as string | undefined) ?? null;
  if (!accountId || !userId) {
    return NextResponse.json({ ok: true, skipped: "missing_fields" });
  }
  // Resolve the workspace from the ATS user id we passed as `name`.
  const admin = getSupabaseAdmin().schema("hiring");
  const { data: member } = await admin
    .from("team_members")
    .select("workspace_id")
    .eq("auth_user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  const workspaceId = member?.workspace_id as string | undefined;
  if (!workspaceId) {
    return NextResponse.json({ ok: true, skipped: "no_workspace" });
  }
  try {
    await seedAccount(accountId, workspaceId, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[unipile callback POST] seed failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "seed_failed" },
      { status: 500 },
    );
  }
}

/** Browser redirect fallback — seed via session if account_id is present. */
export async function GET(req: Request): Promise<NextResponse> {
  const base = await siteUrl();
  const settings = (params: Record<string, string>) => {
    const url = new URL("/settings/integrations", base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };
  const sp = new URL(req.url).searchParams;
  const err = sp.get("error") ?? sp.get("error_type");
  if (err) return settings({ error: err.slice(0, 60) });
  const accountId = sp.get("account_id") ?? sp.get("accountId");
  if (!accountId) return settings({ connected: "1" });
  const me = await getCurrentUser();
  if (!me) return settings({ connected: "1" });
  try {
    await seedAccount(accountId, me.workspace.id, me.id);
    return settings({ connected: "1" });
  } catch {
    return settings({ error: "seed_failed" });
  }
}
