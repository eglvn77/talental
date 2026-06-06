"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { requireCurrentTeamMember } from "@/lib/auth/team";
import { type ActionResult } from "@/app/(app)/_actions/_shared";

/**
 * Role Calibration History entries — recruiter-authored notes about
 * each client conversation that shifts the brief. Eventually this
 * will be populated automatically by a Slack/WhatsApp/email timeline
 * ingester; for now every row is manual so we still have a single
 * canonical record of why the package changed over time.
 */

export type FeedbackSource =
  | "manual"
  | "slack"
  | "whatsapp"
  | "call"
  | "email"
  | "other";

export const FEEDBACK_SOURCES: FeedbackSource[] = [
  "manual",
  "call",
  "slack",
  "whatsapp",
  "email",
  "other",
];

export type FeedbackEntry = {
  id: string;
  job_id: string;
  body: string;
  source: FeedbackSource;
  received_at: string;
  recorded_by_team_member_id: string | null;
  created_at: string;
};

function paths(jobId: string) {
  return [
    `/jobs/${jobId}`,
    `/jobs/${jobId}/paquete`,
  ];
}

export async function createJobFeedbackAction(input: {
  jobId: string;
  body: string;
  source: FeedbackSource;
  receivedAt?: string;
}): Promise<ActionResult<FeedbackEntry>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Cuerpo vacío" };
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  // Confirm the job belongs to the recruiter's workspace.
  const { data: job } = await db
    .from("jobs")
    .select("id")
    .eq("id", input.jobId)
    .maybeSingle();
  if (!job) return { ok: false, error: "Vacante no encontrada" };
  const { data, error } = await db
    .from("job_feedback_entries")
    .insert({
      workspace_id: workspaceId,
      job_id: input.jobId,
      body,
      source: input.source,
      received_at: input.receivedAt ?? new Date().toISOString(),
      recorded_by_team_member_id: guard.data.id,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed" };
  }
  for (const p of paths(input.jobId)) revalidatePath(p);
  return { ok: true, data: data as FeedbackEntry };
}

export async function updateJobFeedbackAction(input: {
  entryId: string;
  jobId: string;
  body?: string;
  source?: FeedbackSource;
  receivedAt?: string;
}): Promise<ActionResult<FeedbackEntry>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const db = await hiring();
  const patch: Record<string, unknown> = {};
  if (input.body !== undefined) {
    const trimmed = input.body.trim();
    if (!trimmed) return { ok: false, error: "Cuerpo vacío" };
    patch.body = trimmed;
  }
  if (input.source !== undefined) patch.source = input.source;
  if (input.receivedAt !== undefined) patch.received_at = input.receivedAt;
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nada que actualizar" };
  }
  const { data, error } = await db
    .from("job_feedback_entries")
    .update(patch)
    .eq("id", input.entryId)
    .eq("job_id", input.jobId)
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Update failed" };
  }
  for (const p of paths(input.jobId)) revalidatePath(p);
  return { ok: true, data: data as FeedbackEntry };
}

export async function deleteJobFeedbackAction(input: {
  entryId: string;
  jobId: string;
}): Promise<ActionResult<{ id: string }>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const db = await hiring();
  const { error } = await db
    .from("job_feedback_entries")
    .delete()
    .eq("id", input.entryId)
    .eq("job_id", input.jobId);
  if (error) return { ok: false, error: error.message };
  for (const p of paths(input.jobId)) revalidatePath(p);
  return { ok: true, data: { id: input.entryId } };
}
