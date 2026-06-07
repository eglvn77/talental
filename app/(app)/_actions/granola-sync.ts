"use server";

import { requireCurrentTeamMember } from "@/lib/auth/team";
import {
  syncGranolaTranscripts,
  type GranolaSyncSummary,
} from "@/lib/integrations/granola/sync";
import { revalidatePath } from "next/cache";
import { type ActionResult } from "./_shared";

/**
 * Manually trigger a Granola sync from the UI (the "Sync now" button
 * on the transcripts panel). Same underlying logic as
 * `/api/cron/granola-sync`; the cron is just the scheduled wrapper.
 *
 * Auth: any authenticated team member can sync (it's a read from
 * Granola + write of new transcripts; the bulk of cost is on Granola's
 * side, and abuse is bounded by Granola's rate limit).
 */
export async function syncGranolaNowAction(): Promise<
  ActionResult<GranolaSyncSummary>
> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  if (!process.env.GRANOLA_API_KEY) {
    return { ok: false, error: "GRANOLA_API_KEY not configured" };
  }
  try {
    const summary = await syncGranolaTranscripts();
    // Refresh whichever candidate slideover the user is looking at —
    // they're likely the one who triggered the sync.
    revalidatePath("/candidates", "page");
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
