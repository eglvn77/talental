/**
 * One-shot (re-runnable) historical import of Unipile chats.
 *
 * POST /api/unipile/backfill
 *   Authorization: Bearer <CRON_SECRET>     (same gate as agents/cron)
 *   Body (all optional):
 *     { "account_id": "<unipile account id>",  // default: every LINKEDIN
 *       "max_chats": 200, "messages_per_chat": 25 }
 *
 * Dedup lives in the ingest pipeline, so re-running only processes
 * messages that weren't seen before. Long-running: capped by
 * maxDuration below; run again to continue where dedup left off.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hiringAdmin } from "@/lib/hiring";
import {
  backfillAccountChats,
  type BackfillStats,
} from "@/lib/integrations/unipile/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    account_id?: string;
    max_chats?: number;
    messages_per_chat?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    // empty body = defaults
  }

  // service_role: secret-gated maintenance endpoint, no user session.
  const db = hiringAdmin();
  let accountsQuery = db
    .from("connected_accounts")
    .select("unipile_account_id, provider")
    .eq("status", "OK");
  if (body.account_id) {
    accountsQuery = accountsQuery.eq("unipile_account_id", body.account_id);
  } else {
    // Default: every chat-based account (not just LinkedIn). Email
    // accounts use a separate import path, so exclude them.
    accountsQuery = accountsQuery.in("provider", [
      "LINKEDIN",
      "WHATSAPP",
      "TELEGRAM",
      "INSTAGRAM",
    ]);
  }
  const { data: accounts, error } = await accountsQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!accounts?.length) {
    return NextResponse.json(
      { error: "no_connected_accounts", hint: "Check hiring.connected_accounts" },
      { status: 404 },
    );
  }

  const results: Record<string, BackfillStats | { error: string }> = {};
  for (const acc of accounts) {
    const id = acc.unipile_account_id as string;
    try {
      results[id] = await backfillAccountChats({
        unipileAccountId: id,
        accountType: (acc.provider as string) ?? "LINKEDIN",
        maxChats: body.max_chats,
        messagesPerChat: body.messages_per_chat,
      });
    } catch (e) {
      results[id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ ok: true, results });
}
