import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncGranolaTranscripts } from "@/lib/integrations/granola/sync";

/**
 * Vercel cron — pulls new Granola meeting transcripts every 15 min.
 *
 * Zapier's Granola trigger requires picking a single folder, which
 * forces the recruiter to maintain a folder convention. We went with
 * cron + email-based auto-link instead: pull every recent note and
 * let the email match decide whether to store it. Internal calls
 * (no candidate attendee) are silently dropped by processGranolaNote.
 *
 * The real-time path is the manual "Sync now" button on the
 * candidate page (syncGranolaNowAction); cron is the passive
 * background safety net.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (same convention as
 * /api/agents/cron). Vercel injects it on its own invocations.
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
