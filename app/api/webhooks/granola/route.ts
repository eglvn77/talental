import { NextResponse } from "next/server";
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
 *
 * The webhook is synchronous: we fetch the full transcript, auto-
 * link, insert, and only then return OK. Zapier sees real failures
 * and can retry (its default behavior on 5xx).
 *
 * Tolerant payload parsing: Zapier's webhook step lets users pick
 * field names, so we accept `note_id`, `id`, or `data.id` — whichever
 * the Zap maps. Validates the `not_*` shape before calling Granola.
 *
 * Auth: NONE. The endpoint is open. Threat model: an attacker would
 * need a valid not_* id that exists in OUR Granola workspace (random
 * fakes 404 against Granola and just return 502 here, no DB writes).
 * Worst case is DoS via spam → Granola API rate limit kicks in
 * upstream and we get throttled. Acceptable for a low-volume internal
 * tool; revisit if Talental moves multi-tenant.
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
