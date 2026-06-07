import { NextResponse } from "next/server";
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
 * Auth: NONE. Same trade-off as the deleted Granola webhook —
 * this endpoint only reads from Granola and writes transcripts
 * that match real candidates by email. Worst case is DoS spam,
 * which Granola's own rate limit catches upstream. Acceptable
 * for an internal tool with no public surface.
 */

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
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
