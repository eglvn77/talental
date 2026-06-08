"use server";

import { requireCurrentTeamMember } from "@/lib/auth/team";
import {
  syncGranolaTranscripts,
  type GranolaSyncSummary,
} from "@/lib/integrations/granola/sync";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { revalidatePath } from "next/cache";
import { type ActionResult } from "./_shared";

export type SyncGranolaResult = GranolaSyncSummary & {
  /**
   * Number of previously-orphan transcripts (candidate_id=null) we
   * claimed for the candidate passed in opts.candidateId by matching
   * attendee names. Always 0 when no candidateId was passed.
   */
  newlyLinkedToCandidate: number;
};

/**
 * Manually trigger a Granola sync from the UI (the "Sync Granola"
 * button on the candidate header). Same underlying logic as
 * `/api/cron/granola-sync` PLUS — when a candidateId is provided —
 * an extra post-sync step that claims workspace-level orphan
 * transcripts whose attendee names fuzzy-match the candidate's
 * full_name. This handles the very common case where a candidate
 * was added via the Chrome extension (LinkedIn URL only, no email)
 * and Granola couldn't auto-link by email.
 *
 * Auth: any authenticated team member can sync.
 */
export async function syncGranolaNowAction(
  opts: { candidateId?: string } = {},
): Promise<ActionResult<SyncGranolaResult>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  if (!process.env.GRANOLA_API_KEY) {
    return { ok: false, error: "GRANOLA_API_KEY not configured" };
  }

  try {
    const summary = await syncGranolaTranscripts();

    // Post-sync orphan claim. Only runs when we have a target
    // candidate AND there are workspace orphans to consider.
    let newlyLinkedToCandidate = 0;
    if (opts.candidateId) {
      newlyLinkedToCandidate = await claimOrphansForCandidate(opts.candidateId);
    }

    revalidatePath("/candidates", "page");
    return {
      ok: true,
      data: { ...summary, newlyLinkedToCandidate },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fuzzy-claim orphan transcripts (candidate_id IS NULL) for the
 * given candidate. Match logic:
 *   - Normalize both sides (lowercase, strip diacritics, collapse
 *     whitespace).
 *   - First+last-name exact match → strong claim.
 *   - Fall back to Levenshtein ≤ 2 on the full normalized name —
 *     handles "Landy A. Millan" vs "Landy Millán".
 *   - Skip if 0 attendee matches OR 2+ candidate's tokens fail to
 *     appear in any attendee name (conservative).
 *
 * Returns the count of orphans claimed.
 */
async function claimOrphansForCandidate(candidateId: string): Promise<number> {
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: cand } = await db
    .from("candidates")
    .select("id, full_name, workspace_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand) return 0;
  const candWorkspace = (cand as { workspace_id?: string }).workspace_id;
  if (candWorkspace !== workspaceId) return 0;
  const candName = ((cand as { full_name?: string }).full_name ?? "").trim();
  if (!candName) return 0;

  // Pull all orphans for the workspace. There usually aren't many;
  // they accumulate from external calls that didn't email-match.
  const { data: orphans } = await db
    .from("interview_transcripts")
    .select("id, attendees")
    .eq("workspace_id", workspaceId)
    .is("candidate_id", null);
  const list = (orphans ?? []) as Array<{
    id: string;
    attendees: Array<{ name?: string; email?: string }> | null;
  }>;
  if (list.length === 0) return 0;

  const candNameNorm = normalizeName(candName);
  const candTokens = candNameNorm.split(/\s+/).filter(Boolean);

  // For each orphan, check any attendee against the candidate's
  // name. First match wins.
  const idsToClaim: string[] = [];
  for (const o of list) {
    const matched = (o.attendees ?? []).some((a) =>
      attendeeMatchesCandidate(a.name ?? "", candNameNorm, candTokens),
    );
    if (matched) idsToClaim.push(o.id);
  }
  if (idsToClaim.length === 0) return 0;

  // Resolve the candidate's most-recent application so we can link
  // each claim to it.
  const { data: apps } = await db
    .from("applications")
    .select("id, status_changed_at")
    .eq("workspace_id", workspaceId)
    .eq("candidate_id", candidateId)
    .order("status_changed_at", { ascending: false })
    .limit(1);
  const recentApp = ((apps ?? [])[0] as { id?: string } | undefined)?.id ?? null;

  const { error } = await db
    .from("interview_transcripts")
    .update({
      candidate_id: candidateId,
      application_id: recentApp,
    })
    .in("id", idsToClaim);
  if (error) {
    console.error("[granola claim] update failed:", error.message);
    return 0;
  }
  return idsToClaim.length;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

function attendeeMatchesCandidate(
  attendeeName: string,
  candNameNorm: string,
  candTokens: string[],
): boolean {
  const attNorm = normalizeName(attendeeName);
  if (!attNorm || !candNameNorm) return false;
  if (attNorm === candNameNorm) return true;

  // Token-set strategy: every candidate token must appear in the
  // attendee name (in any order). Handles "Landy A. Millan" vs
  // "Landy Millán" (after normalization → "landy a millan" vs
  // "landy millan"; both candidate tokens "landy" and "millan"
  // appear in the attendee form).
  const attTokens = new Set(attNorm.split(/\s+/).filter(Boolean));
  if (candTokens.length >= 2 && candTokens.every((t) => attTokens.has(t))) {
    return true;
  }

  // Fall-back: Levenshtein distance ≤ 2 on full normalized strings.
  if (levenshtein(attNorm, candNameNorm) <= 2) return true;
  return false;
}

/**
 * Iterative Levenshtein distance. Small inputs (names ≤ 50 chars),
 * no perf concern. Returns Number.MAX_SAFE_INTEGER on either-empty
 * inputs so the caller's `<= 2` check fails closed.
 */
function levenshtein(a: string, b: string): number {
  if (!a || !b) return Number.MAX_SAFE_INTEGER;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return Number.MAX_SAFE_INTEGER; // early exit
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}
