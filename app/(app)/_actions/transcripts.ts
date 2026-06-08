"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { requireCurrentTeamMember } from "@/lib/auth/team";
import { type ActionResult } from "./_shared";

/**
 * Re-associate an interview transcript with a specific application.
 * Used by the "Unlinked transcripts" tray in the Conversations tab
 * when a call belongs to a candidate but was either claimed at the
 * candidate level (application_id=null) OR linked to a different
 * application that the recruiter wants to switch.
 */
export async function attachTranscriptToApplicationAction(input: {
  transcriptId: string;
  applicationId: string;
}): Promise<ActionResult<{ ok: true }>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Verify both rows live in the user's workspace before the patch.
  // RLS would also catch this; the explicit check gives us a clean
  // error message instead of a silent zero-row update.
  const { data: trans } = await db
    .from("interview_transcripts")
    .select("id, workspace_id, candidate_id")
    .eq("id", input.transcriptId)
    .maybeSingle();
  if (!trans) return { ok: false, error: "Transcript not found" };
  if ((trans as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace transcript" };
  }

  const { data: app } = await db
    .from("applications")
    .select("id, workspace_id, candidate_id")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!app) return { ok: false, error: "Application not found" };
  if ((app as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace application" };
  }

  // Side effect: ensure candidate_id agrees with the application's
  // candidate. The transcript might have been a workspace orphan
  // (candidate_id=null); attaching to an app implicitly claims it
  // for that application's candidate.
  const targetCandidate = (app as { candidate_id: string }).candidate_id;

  const { error } = await db
    .from("interview_transcripts")
    .update({
      application_id: input.applicationId,
      candidate_id: targetCandidate,
    })
    .eq("id", input.transcriptId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath("/candidates", "page");
  return { ok: true, data: { ok: true } };
}
