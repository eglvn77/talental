import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncGranolaTranscripts } from "@/lib/integrations/granola/sync";

/**
 * Vercel cron — pulls new Granola meeting transcripts every 15 min.
 *
 * The actual sync logic lives in `lib/integrations/granola/sync.ts`
 * so the manual "Sync now" action can reuse it. This route is just
 * the cron entry-point + auth wrapper.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (same convention as
 * `/api/agents/cron`). Vercel injects it on its own invocations;
 * manual hits need to set it.
 */

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GRANOLA_API_KEY) {
    return NextResponse.json(
      { error: "GRANOLA_API_KEY not configured" },
      { status: 503 },
    );
  }
  try {
    const summary = await syncGranolaTranscripts();
    return NextResponse.json(summary, { status: summary.ok ? 200 : 207 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
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
