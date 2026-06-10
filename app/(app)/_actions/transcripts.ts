"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { requireCurrentTeamMember } from "@/lib/auth/team";
import { type ActionResult } from "./_shared";

/**
 * Manually attach a transcript to a candidate (and optionally an
 * application). The Conversations tab uses this when the recruiter
 * pastes the transcript from Granola UI directly — handy for calls
 * the auto-sync can't find (Granola processing delay, attendee
 * mismatch, etc.) so they're not blocked from generating the
 * candidate report.
 */
export async function addManualTranscriptAction(input: {
  candidateId: string;
  applicationId?: string | null;
  title: string;
  transcript: string;
  recordedAt?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Validate candidate is in this workspace.
  const { data: cand } = await db
    .from("candidates")
    .select("id, workspace_id")
    .eq("id", input.candidateId)
    .maybeSingle();
  if (!cand) return { ok: false, error: "Candidate not found" };
  if ((cand as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace candidate" };
  }

  // Optional applicationId — must belong to the candidate when set.
  let appIdToUse: string | null = null;
  if (input.applicationId) {
    const { data: app } = await db
      .from("applications")
      .select("id, candidate_id, workspace_id")
      .eq("id", input.applicationId)
      .maybeSingle();
    if (
      !app ||
      (app as { workspace_id: string }).workspace_id !== workspaceId ||
      (app as { candidate_id: string }).candidate_id !== input.candidateId
    ) {
      return { ok: false, error: "Application doesn't belong to candidate" };
    }
    appIdToUse = (app as { id: string }).id;
  }

  const trimmedTitle = (input.title ?? "").trim() || "Untitled call";
  const trimmedTranscript = (input.transcript ?? "").trim();
  if (!trimmedTranscript) {
    return { ok: false, error: "Transcript text required" };
  }

  const { data: inserted, error } = await db
    .from("interview_transcripts")
    .insert({
      workspace_id: workspaceId,
      candidate_id: input.candidateId,
      application_id: appIdToUse,
      source: "manual",
      title: trimmedTitle,
      transcript: trimmedTranscript,
      recorded_at: input.recordedAt || new Date().toISOString(),
      attendees: [],
      metadata: {},
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return {
      ok: false,
      error: error?.message?.slice(0, 300) ?? "Insert failed",
    };
  }
  revalidatePath("/candidates", "page");
  return { ok: true, data: { id: (inserted as { id: string }).id } };
}

/**
 * Fetch one transcript's full text for the in-ATS viewer dialog.
 * The list views only carry metadata (id/title/recorded_at) to keep
 * payloads light; the body loads lazily when the recruiter opens it.
 */
export async function getTranscriptTextAction(input: {
  transcriptId: string;
}): Promise<
  ActionResult<{
    title: string | null;
    transcript: string;
    recorded_at: string | null;
    source: string;
  }>
> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const { data } = await db
    .from("interview_transcripts")
    .select("title, transcript, recorded_at, source, workspace_id")
    .eq("id", input.transcriptId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Transcript not found" };
  const row = data as {
    title: string | null;
    transcript: string;
    recorded_at: string | null;
    source: string;
    workspace_id: string;
  };
  if (row.workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace transcript" };
  }
  return {
    ok: true,
    data: {
      title: row.title,
      transcript: row.transcript,
      recorded_at: row.recorded_at,
      source: row.source,
    },
  };
}

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
