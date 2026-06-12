/**
 * Unipile messaging webhook receiver.
 *
 * Registered via lib/integrations/unipile/messaging.ts#createMessagingWebhook
 * with a custom `X-Webhook-Secret` header — Unipile replays that header
 * on every delivery, so auth is a timing-safe compare against
 * UNIPILE_WEBHOOK_SECRET (same pattern as the Slack events route).
 *
 * Unipile retries failed deliveries; the ingest pipeline dedups on
 * messages(channel, external_id), so replays are harmless.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ingestNormalizedMessage,
  normalizeWebhookPayload,
  normalizeEmailWebhook,
  isEmailWebhook,
  type UnipileMessagingWebhookPayload,
  type UnipileEmailWebhookPayload,
} from "@/lib/integrations/unipile/ingest";

export const dynamic = "force-dynamic";

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

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // One webhook URL receives both `messaging` (LinkedIn/WhatsApp chats)
  // and `email` (Gmail/Outlook) source events — they have different
  // payload shapes, so pick the right normalizer.
  const normalized = isEmailWebhook(payload)
    ? normalizeEmailWebhook(payload as UnipileEmailWebhookPayload)
    : normalizeWebhookPayload(payload as UnipileMessagingWebhookPayload);
  if (!normalized) {
    // Reactions / read receipts / malformed — acknowledged, not ingested.
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const result = await ingestNormalizedMessage(normalized);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // 500 → Unipile retries later; dedup makes the retry safe.
    console.error("[unipile webhook] ingest failed:", e);
    return NextResponse.json({ error: "ingest_failed" }, { status: 500 });
  }
}
