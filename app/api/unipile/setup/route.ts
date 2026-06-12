/**
 * One-shot Unipile bootstrap (re-runnable):
 *   1. Seeds hiring.connected_accounts from Unipile's account list.
 *   2. Registers the messaging webhook pointing at THIS deployment
 *      (idempotent: skips when a webhook with the same URL exists).
 *   3. Optionally runs a chat backfill.
 *
 * Auth: X-Webhook-Secret = UNIPILE_WEBHOOK_SECRET (the operator knows
 * it; Unipile API keys never leave the server).
 *
 * POST /api/unipile/setup
 * Body: {
 *   workspace_slug?: string,      // default "talental"
 *   owner_email?: string,         // default first active team member
 *   register_webhook?: boolean,   // default true
 *   backfill?: { max_chats?: number, messages_per_chat?: number }
 * }
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hiringAdmin } from "@/lib/hiring";
import { listAccounts, mapUnipileStatus } from "@/lib/integrations/unipile/client";
import {
  createMessagingWebhook,
  createEmailWebhook,
  listWebhooks,
} from "@/lib/integrations/unipile/messaging";
import { backfillAccountChats } from "@/lib/integrations/unipile/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secretMatches(provided: string | null): boolean {
  const expected = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!secretMatches(req.headers.get("x-webhook-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    workspace_slug?: string;
    owner_email?: string;
    register_webhook?: boolean;
    backfill?: { max_chats?: number; messages_per_chat?: number };
    /** Re-run profile enrichment for monitor-created candidates that
     *  failed or are still minimal (uses the case-preserved provider
     *  id stored on their conversation). */
    reenrich?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    // defaults
  }

  // service_role: secret-gated bootstrap, no user session.
  const db = hiringAdmin();
  const slug = body.workspace_slug ?? "talental";
  const { data: ws } = await db.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) return NextResponse.json({ error: `workspace ${slug} not found` }, { status: 404 });
  const workspaceId = ws.id as string;

  let ownerQuery = db
    .from("team_members")
    .select("auth_user_id")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .not("auth_user_id", "is", null)
    .limit(1);
  if (body.owner_email) ownerQuery = ownerQuery.eq("email", body.owner_email);
  const { data: owner } = await ownerQuery;
  const ownerUserId = owner?.[0]?.auth_user_id as string | undefined;
  if (!ownerUserId) {
    return NextResponse.json({ error: "no team member to own accounts" }, { status: 404 });
  }

  // 1) Seed connected_accounts
  const { items } = await listAccounts();
  const seeded: Array<{ id: string; provider: string; action: string }> = [];
  for (const acc of items) {
    const provider = (acc.type ?? "").toUpperCase();
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
        .update({ status, account_metadata: metadata, last_status_update: new Date().toISOString() })
        .eq("id", existing.id as string);
      seeded.push({ id: acc.id, provider, action: "updated" });
    } else {
      await db.from("connected_accounts").insert({
        user_id: ownerUserId,
        workspace_id: workspaceId,
        provider,
        unipile_account_id: acc.id,
        status,
        account_metadata: metadata,
      });
      seeded.push({ id: acc.id, provider, action: "created" });
    }
  }

  // 2) Register both source webhooks (messaging + email), idempotent
  //    by (request_url, source). Both point at the same receiver, which
  //    branches by payload shape.
  let webhook: { action: string; url?: string; sources?: string[] } = {
    action: "skipped",
  };
  if (body.register_webhook !== false) {
    const origin = new URL(req.url).origin;
    const requestUrl = `${origin}/api/unipile/webhook`;
    const secret = process.env.UNIPILE_WEBHOOK_SECRET ?? "";
    try {
      const existing = await listWebhooks();
      const has = (source: string) =>
        (existing.items ?? []).some(
          (w) => w.request_url === requestUrl && w.source === source,
        );
      const created: string[] = [];
      if (!has("messaging")) {
        await createMessagingWebhook({ requestUrl, secret, name: "ats-conversations" });
        created.push("messaging");
      }
      if (!has("email")) {
        await createEmailWebhook({ requestUrl, secret, name: "ats-conversations-email" });
        created.push("email");
      }
      webhook = {
        action: created.length ? "created" : "exists",
        url: requestUrl,
        sources: created.length ? created : ["messaging", "email"],
      };
    } catch (e) {
      webhook = { action: `error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // 3) Optional backfill — every chat-based account (LinkedIn,
  //    WhatsApp, Telegram, Instagram). Email accounts use a separate
  //    import path, not chat backfill.
  const CHAT_PROVIDERS = new Set([
    "LINKEDIN",
    "WHATSAPP",
    "TELEGRAM",
    "INSTAGRAM",
  ]);
  let backfill: unknown = null;
  if (body.backfill) {
    const results: Record<string, unknown> = {};
    for (const acc of items) {
      const provider = (acc.type ?? "").toUpperCase();
      if (!CHAT_PROVIDERS.has(provider)) continue;
      try {
        results[acc.id] = await backfillAccountChats({
          unipileAccountId: acc.id,
          accountType: provider,
          maxChats: body.backfill.max_chats,
          messagesPerChat: body.backfill.messages_per_chat,
        });
      } catch (e) {
        results[acc.id] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    backfill = results;
  }

  // 4) Optional enrichment repair for monitor-created candidates
  let reenriched: unknown = null;
  if (body.reenrich) {
    const { enrichCandidateViaUnipileAdmin } = await import(
      "@/lib/integrations/unipile/profile"
    );
    const { data: pinCandidates } = await db
      .from("candidates")
      .select("id, full_name, enrichment_status")
      .eq("workspace_id", workspaceId)
      .eq("source_id", "1af52289-ea25-453c-bda5-67064045a23d")
      .or("enrichment_status.is.null,enrichment_status.neq.unipile_ok");
    const results: Array<{ id: string; name: string; ok: boolean; error?: string }> = [];
    for (const cand of pinCandidates ?? []) {
      // The conversation keeps the attendee identifier with original
      // casing (profile URL with the ACoAA… provider id).
      const { data: conv } = await db
        .from("conversations")
        .select("attendee_identifier")
        .eq("candidate_id", cand.id as string)
        .not("attendee_identifier", "is", null)
        .limit(1);
      const identifier = conv?.[0]?.attendee_identifier as string | undefined;
      const providerId = identifier?.match(/(ACoAA[\w-]+)/)?.[1];
      try {
        const res = await enrichCandidateViaUnipileAdmin(
          workspaceId,
          cand.id as string,
          providerId,
        );
        results.push({
          id: cand.id as string,
          name: cand.full_name as string,
          ok: res.ok,
          ...(res.ok ? {} : { error: res.error }),
        });
        if (!res.ok && /Límite diario/.test(res.error)) break; // daily cap hit
      } catch (e) {
        results.push({
          id: cand.id as string,
          name: cand.full_name as string,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    reenriched = { attempted: results.length, ok: results.filter((r) => r.ok).length, results };
  }

  return NextResponse.json({ ok: true, seeded, webhook, backfill, reenriched });
}
