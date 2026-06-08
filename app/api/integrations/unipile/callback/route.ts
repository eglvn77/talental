import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hiring } from "@/lib/hiring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAccount,
  mapUnipileStatus,
} from "@/lib/integrations/unipile/client";
import type { ConnectedAccountProvider } from "@/lib/hiring";

/**
 * Unipile Hosted Auth v2 callback handler.
 *
 * Replaces the v1 webhook flow. Unipile v2 redirects the user
 * directly back to OUR app with query params identifying the
 * outcome:
 *
 *   ?account_id=acc_xxx&provider=linkedin                  (success)
 *   ?error_type=...&error_title=...&error_detail=...        (failure)
 *   ?error_type=api/already_exists&error_detail=acc_xxx     (duplicate)
 *
 * Because this is a GET on our domain, the user's Supabase session
 * cookie comes with it — we can identify WHICH team_member just
 * authed and persist the connection in connected_accounts
 * deterministically. No more webhook + correlation gymnastics.
 *
 * On success: upsert and redirect to /settings/integrations.
 * On failure: redirect with ?status=failure + error message in URL.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  const params = req.nextUrl.searchParams;
  const accountId = params.get("account_id");
  const provider = (params.get("provider") ?? "").toUpperCase();
  const errorType = params.get("error_type");

  const baseRedirect = "/settings/integrations";

  // Failure path
  if (errorType) {
    console.warn("[unipile callback] failure:", {
      errorType,
      detail: params.get("error_detail"),
      title: params.get("error_title"),
    });
    return NextResponse.redirect(
      new URL(`${baseRedirect}?status=failure`, req.url),
    );
  }

  if (!session) {
    // Session expired between starting wizard and the redirect
    // back. Send them to login; the connection at Unipile's side
    // is fine, they can reconnect later.
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (!accountId || !provider) {
    console.error(
      "[unipile callback] missing account_id or provider:",
      Object.fromEntries(params),
    );
    return NextResponse.redirect(
      new URL(`${baseRedirect}?status=failure`, req.url),
    );
  }

  // Resolve workspace from current session.
  const db = await hiring();
  const { data: teamMember } = await db
    .from("team_members")
    .select("id, workspace_id")
    .eq("auth_user_id", session.id)
    .maybeSingle();

  if (!teamMember) {
    console.error(
      "[unipile callback] no team_member for auth_user_id:",
      session.id,
    );
    return NextResponse.redirect(
      new URL(`${baseRedirect}?status=failure`, req.url),
    );
  }

  // Fetch the account from Unipile to enrich metadata (email,
  // public_id, profile, etc.). Failure here is non-fatal — we'll
  // still save the basic row.
  let metadata: Record<string, unknown> = { type: provider };
  let status = "ok";
  try {
    const acc = await getAccount(accountId);
    type AccountShape = {
      type?: string;
      email?: string;
      phone?: string;
      public_id?: string;
      status?: string;
      sources?: Array<{ status?: string; [k: string]: unknown }>;
      connection_params?: unknown;
      profile?: unknown;
    };
    const a = acc as AccountShape;
    metadata = {
      type: a.type ?? provider,
    };
    if (a.email) metadata.email = a.email;
    if (a.phone) metadata.phone = a.phone;
    if (a.public_id) metadata.public_id = a.public_id;
    if (Array.isArray(a.sources)) metadata.sources = a.sources;
    if (a.connection_params) metadata.connection_params = a.connection_params;
    if (a.profile) metadata.profile = a.profile;
    const firstSourceStatus = Array.isArray(a.sources) && a.sources.length > 0
      ? a.sources[0]?.status
      : undefined;
    status = mapUnipileStatus(a.status || firstSourceStatus || "");
  } catch (e) {
    console.warn(
      "[unipile callback] getAccount enrichment failed, saving anyway:",
      e,
    );
  }

  // Upsert via service-role client (bypass RLS).
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .schema("hiring")
    .from("connected_accounts")
    .upsert(
      {
        user_id: (teamMember as { id: string }).id,
        workspace_id: (teamMember as { workspace_id: string }).workspace_id,
        provider: provider as ConnectedAccountProvider,
        unipile_account_id: accountId,
        status,
        last_status_update: new Date().toISOString(),
        account_metadata: metadata,
      },
      { onConflict: "user_id,provider" },
    );

  if (error) {
    console.error("[unipile callback] upsert failed:", error);
    return NextResponse.redirect(
      new URL(`${baseRedirect}?status=failure`, req.url),
    );
  }

  console.log(
    "[unipile callback] connected_account upserted for workspace",
    (teamMember as { workspace_id: string }).workspace_id,
    "provider",
    provider,
  );
  return NextResponse.redirect(
    new URL(`${baseRedirect}?status=success`, req.url),
  );
}
