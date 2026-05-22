"use server";

import { hiring } from "@/lib/hiring";
import { ensureAdmin, type ActionResult } from "./_shared";

/**
 * Update a single outreach sequence step (subject + body). The step
 * must belong to the user's workspace — RLS enforces it; we don't
 * pass workspace_id from the client.
 */
export async function updateSequenceStepAction(input: {
  stepId: string;
  subject?: string | null;
  body?: string | null;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const patch: Record<string, unknown> = {};
  if (input.subject !== undefined)
    patch.subject_template = input.subject?.trim() || null;
  if (input.body !== undefined) {
    const body = input.body?.trim() || null;
    patch.body_template = body;
    // task_body mirrors body when the step is a manual_task (LinkedIn
    // invitation / InMail). For email/linkedin_message it's irrelevant
    // but harmless to write.
    patch.task_body = body;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to update" };
  }
  const { error } = await (await hiring())
    .from("sequence_steps")
    .update(patch)
    .eq("id", input.stepId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return { ok: true };
}
