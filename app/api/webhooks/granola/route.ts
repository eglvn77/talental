import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  processGranolaNote,
  resolveGranolaWorkspaceId,
} from "@/lib/integrations/granola/sync";

/**
 * Granola webhook — fired by a Zap on "New Note Created" in the
 * recruiting folder. Replaces the cron-based polling: instead of
 * checking Granola every 15 min, Granola (via Zapier) tells us
 * the moment a note exists.
 *
 * Zap config:
 *   Trigger:  Granola → New Note Created (filter by folder = your
 *             "Recruiting" folder).
 *   Action:   Webhook → POST to https://<this-host>/api/webhooks/granola
 *             Body (JSON): { "note_id": "{{Note ID}}" }
 *             Header: Authorization: Bearer ${GRANOLA_WEBHOOK_SECRET}
 *
 * The webhook is synchronous: we fetch the full transcript, auto-
 * link, insert, and only then return OK. Zapier sees real failures
 * and can retry (its default behavior on 5xx).
 *
 * Tolerant payload parsing: Zapier's webhook step lets users pick
 * field names, so we accept `note_id`, `id`, or `data.id` — whichever
 * the Zap maps. Validates the `not_*` shape before calling Granola.
 *
 * Auth: shared-secret Bearer (env GRANOLA_WEBHOOK_SECRET). Distinct
 * from CRON_SECRET so a leak of one doesn't compromise the other.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOTE_ID_RE = /^not_[A-Za-z0-9]{14}$/;

type WebhookPayload = {
  note_id?: string;
  id?: string;
  data?: { id?: string; note_id?: string };
};

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GRANOLA_API_KEY) {
    return NextResponse.json(
      { error: "GRANOLA_API_KEY not configured" },
      { status: 503 },
    );
  }

  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const noteId =
    body.note_id ?? body.id ?? body.data?.id ?? body.data?.note_id ?? null;
  if (!noteId || typeof noteId !== "string" || !NOTE_ID_RE.test(noteId)) {
    return NextResponse.json(
      {
        error: "Missing or invalid note id (expected not_* in note_id|id|data.id)",
      },
      { status: 400 },
    );
  }

  const wsRes = await resolveGranolaWorkspaceId();
  if (!wsRes.ok) {
    return NextResponse.json({ error: wsRes.error }, { status: 500 });
  }

  const result = await processGranolaNote(noteId, wsRes.workspaceId);
  if (!result.ok) {
    // 5xx so Zapier retries the webhook step automatically.
    return NextResponse.json(
      { error: result.error, note_id: noteId },
      { status: 502 },
    );
  }
  return NextResponse.json(
    {
      note_id: noteId,
      action: result.action,
      transcript_id: "transcript_id" in result ? result.transcript_id : null,
      application_id:
        "application_id" in result ? (result.application_id ?? null) : null,
    },
    { status: 200 },
  );
}

function authorize(req: Request): boolean {
  const expected = process.env.GRANOLA_WEBHOOK_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) return false;
  const provided = match[1];
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
