"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { requireCurrentTeamMember } from "@/lib/auth/team";
import { enrollCandidate, loadSteps, type Db } from "@/lib/sequences/engine";
import {
  delayToMinutes,
  generateSequenceSteps,
  type GenerateSequenceInput,
} from "@/lib/sequences/generate";
import { ensureAdmin, type ActionResult } from "./_shared";

/**
 * Server actions for the Sequences module (Leonar-style outreach).
 * Execution happens in the cron runner (lib/sequences/runner.ts);
 * these actions only mutate definitions, enrollments and queue rows.
 */

/**
 * Update a single outreach sequence step (subject + body). The step
 * must belong to the user's workspace — RLS enforces it; we don't
 * pass workspace_id from the client. (Pre-dates the full module;
 * kept for the job sub-tab editor.)
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

// ============================================================
// Shared guards
// ============================================================

async function guarded(): Promise<
  | { ok: true; db: Awaited<ReturnType<typeof hiring>>; workspaceId: string }
  | { ok: false; error: string }
> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  return { ok: true, db, workspaceId };
}

async function assertSequence(
  db: Awaited<ReturnType<typeof hiring>>,
  workspaceId: string,
  sequenceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await db
    .from("sequences")
    .select("id, workspace_id")
    .eq("id", sequenceId)
    .maybeSingle();
  if (!data || (data as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: "Sequence not found" };
  }
  return { ok: true };
}

// ============================================================
// Create / duplicate / AI-generate
// ============================================================

export async function createSequenceAction(input: {
  name: string;
  mode: "simple" | "advanced" | "duplicate" | "ai";
  duplicateFromId?: string;
  ai?: Omit<GenerateSequenceInput, "name">;
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required" };

  const { data: created, error } = await db
    .from("sequences")
    .insert({
      workspace_id: workspaceId,
      name,
      status: "draft",
      target_entity_type: "candidate",
      settings: { mode: input.mode === "advanced" ? "advanced" : "simple" },
    })
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "Couldn't create sequence" };
  }
  const sequenceId = created.id as string;

  try {
    if (input.mode === "duplicate" && input.duplicateFromId) {
      const check = await assertSequence(db, workspaceId, input.duplicateFromId);
      if (!check.ok) return check;
      await copySteps(db as unknown as Db, input.duplicateFromId, sequenceId, workspaceId);
    }
    if (input.mode === "ai" && input.ai) {
      const steps = await generateSequenceSteps({ ...input.ai, name });
      let position = 10;
      for (const s of steps) {
        await db.from("sequence_steps").insert({
          workspace_id: workspaceId,
          sequence_id: sequenceId,
          position,
          kind: s.kind,
          delay_minutes: delayToMinutes(s.delay_value, s.delay_unit),
          subject_template: s.subject,
          body_template: s.body,
          execution_mode: "automatic",
        });
        position += 10;
      }
    }
  } catch (e) {
    // Sequence shell exists; surface the generation error but keep it.
    return {
      ok: false,
      error: `Sequence created but steps failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  revalidatePath("/sequences");
  return { ok: true, data: { id: sequenceId } };
}

async function copySteps(
  db: Db,
  fromId: string,
  toId: string,
  workspaceId: string,
): Promise<void> {
  const steps = await loadSteps(db, fromId);
  const idMap = new Map<string, string>();
  // Parents must exist before children; roots have parent null.
  const pendingParent = [...steps];
  while (pendingParent.length > 0) {
    const ready = pendingParent.filter(
      (s) => !s.parent_step_id || idMap.has(s.parent_step_id),
    );
    if (ready.length === 0) break; // broken graph — copy what we can
    for (const s of ready) {
      const { data } = await db
        .from("sequence_steps")
        .insert({
          workspace_id: workspaceId,
          sequence_id: toId,
          position: s.position,
          kind: s.kind,
          delay_minutes: s.delay_minutes,
          subject_template: s.subject_template,
          body_template: s.body_template,
          task_title: s.task_title,
          task_body: s.task_body,
          config: s.config ?? {},
          execution_mode: s.execution_mode,
          sender_account_id: s.sender_account_id,
          sender_rotation: s.sender_rotation,
          parent_step_id: s.parent_step_id ? idMap.get(s.parent_step_id) : null,
          branch_path: s.branch_path,
          branch_condition: s.branch_condition,
        })
        .select("id")
        .single();
      if (data) idMap.set(s.id, data.id as string);
      pendingParent.splice(pendingParent.indexOf(s), 1);
    }
  }
}

export async function duplicateSequenceAction(input: {
  sequenceId: string;
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const { data: src } = await db
    .from("sequences")
    .select("id, name, workspace_id, settings, entry_conditions")
    .eq("id", input.sequenceId)
    .maybeSingle();
  if (!src || (src as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: "Sequence not found" };
  }
  const { data: created, error } = await db
    .from("sequences")
    .insert({
      workspace_id: workspaceId,
      name: `${(src as { name: string }).name} (copy)`,
      status: "draft",
      target_entity_type: "candidate",
      settings: (src as { settings: unknown }).settings ?? {},
      entry_conditions: (src as { entry_conditions: unknown }).entry_conditions ?? [],
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Duplicate failed" };
  await copySteps(db as unknown as Db, input.sequenceId, created.id as string, workspaceId);
  revalidatePath("/sequences");
  return { ok: true, data: { id: created.id as string } };
}

// ============================================================
// Update / status / delete
// ============================================================

export async function updateSequenceAction(input: {
  sequenceId: string;
  patch: { name?: string; priority?: number; status?: string };
}): Promise<ActionResult> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const check = await assertSequence(db, workspaceId, input.sequenceId);
  if (!check.ok) return check;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.patch.name !== undefined) patch.name = input.patch.name.trim();
  if (input.patch.priority !== undefined) patch.priority = input.patch.priority;
  if (input.patch.status !== undefined) {
    if (!["draft", "active", "paused", "archived"].includes(input.patch.status)) {
      return { ok: false, error: "Invalid status" };
    }
    patch.status = input.patch.status;
  }
  const { error } = await db.from("sequences").update(patch).eq("id", input.sequenceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sequences");
  return { ok: true };
}

export async function deleteSequenceAction(input: {
  sequenceId: string;
}): Promise<ActionResult> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const check = await assertSequence(db, workspaceId, input.sequenceId);
  if (!check.ok) return check;
  const { error } = await db.from("sequences").delete().eq("id", input.sequenceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sequences");
  return { ok: true };
}

// ============================================================
// Enrollment
// ============================================================

export async function enrollCandidatesAction(input: {
  sequenceId: string;
  candidateIds: string[];
}): Promise<ActionResult<{ enrolled: number; failed: Array<{ id: string; error: string }> }>> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const check = await assertSequence(db, workspaceId, input.sequenceId);
  if (!check.ok) return check;

  let enrolled = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const candidateId of input.candidateIds.slice(0, 100)) {
    const res = await enrollCandidate(db as unknown as Db, {
      workspaceId,
      sequenceId: input.sequenceId,
      candidateId,
    });
    if (res.ok) enrolled++;
    else failed.push({ id: candidateId, error: res.error });
  }
  revalidatePath(`/sequences/${input.sequenceId}`);
  return { ok: true, data: { enrolled, failed } };
}

export async function setEnrollmentStatusAction(input: {
  enrollmentId: string;
  status: "active" | "paused" | "completed" | "replied" | "unsubscribed";
}): Promise<ActionResult> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const { data: enr } = await db
    .from("sequence_enrollments")
    .select("id, workspace_id, sequence_id")
    .eq("id", input.enrollmentId)
    .maybeSingle();
  if (!enr || (enr as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: "Enrollment not found" };
  }
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "completed") patch.completed_at = new Date().toISOString();
  if (input.status === "replied") patch.replied_at = new Date().toISOString();
  if (input.status === "paused") patch.paused_at = new Date().toISOString();
  if (input.status === "unsubscribed") patch.unsubscribed_at = new Date().toISOString();
  const { error } = await db
    .from("sequence_enrollments")
    .update(patch)
    .eq("id", input.enrollmentId);
  if (error) return { ok: false, error: error.message };
  // Terminal states cancel any queued work.
  if (["completed", "replied", "unsubscribed"].includes(input.status)) {
    await db
      .from("sequence_queue")
      .update({ status: "cancelled" })
      .eq("enrollment_id", input.enrollmentId)
      .in("status", ["pending", "processing"]);
  }
  revalidatePath(`/sequences/${(enr as { sequence_id: string }).sequence_id}`);
  return { ok: true };
}

// ============================================================
// Step editing (visual editor)
// ============================================================

export interface StepPatch {
  kind?: string;
  delay_minutes?: number;
  subject_template?: string | null;
  body_template?: string | null;
  task_title?: string | null;
  task_body?: string | null;
  config?: Record<string, unknown>;
  execution_mode?: "automatic" | "manual";
  sender_account_id?: string | null;
  sender_rotation?: boolean;
}

export async function addStepAction(input: {
  sequenceId: string;
  afterStepId?: string | null;
  parentStepId?: string | null;
  branchPath?: "yes" | "no" | null;
  branchCondition?: string | null;
  kind: string;
}): Promise<ActionResult<{ id: string }>> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const check = await assertSequence(db, workspaceId, input.sequenceId);
  if (!check.ok) return check;

  const steps = await loadSteps(db as unknown as Db, input.sequenceId);
  const parent = input.parentStepId ?? null;
  const branch = input.branchPath ?? null;
  const laneSteps = steps
    .filter((s) => s.parent_step_id === parent && s.branch_path === branch)
    .sort((a, b) => a.position - b.position);

  let position: number;
  if (input.afterStepId) {
    const idx = laneSteps.findIndex((s) => s.id === input.afterStepId);
    const prev = laneSteps[idx]?.position ?? 0;
    const next = laneSteps[idx + 1]?.position;
    position = next !== undefined ? Math.floor((prev + next) / 2) : prev + 10;
    if (position === prev) {
      // No gap left — renumber the lane (rare).
      let p = 10;
      for (const s of laneSteps) {
        await db.from("sequence_steps").update({ position: p }).eq("id", s.id);
        p += 10;
      }
      position = (idx + 1) * 10 + 5;
    }
  } else {
    position = (laneSteps[laneSteps.length - 1]?.position ?? 0) + 10;
  }

  const { data, error } = await db
    .from("sequence_steps")
    .insert({
      workspace_id: workspaceId,
      sequence_id: input.sequenceId,
      position,
      kind: input.kind,
      delay_minutes: input.afterStepId || parent ? 24 * 60 : 0,
      execution_mode: "automatic",
      parent_step_id: parent,
      branch_path: branch,
      branch_condition: input.branchCondition ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't add step" };
  revalidatePath(`/sequences/${input.sequenceId}/editor`);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateStepAction(input: {
  stepId: string;
  patch: StepPatch;
}): Promise<ActionResult> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const { data: step } = await db
    .from("sequence_steps")
    .select("id, workspace_id, sequence_id")
    .eq("id", input.stepId)
    .maybeSingle();
  if (!step || (step as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: "Step not found" };
  }
  const { error } = await db
    .from("sequence_steps")
    .update(input.patch as Record<string, unknown>)
    .eq("id", input.stepId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sequences/${(step as { sequence_id: string }).sequence_id}/editor`);
  return { ok: true };
}

export async function deleteStepAction(input: { stepId: string }): Promise<ActionResult> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const { data: step } = await db
    .from("sequence_steps")
    .select("id, workspace_id, sequence_id")
    .eq("id", input.stepId)
    .maybeSingle();
  if (!step || (step as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: "Step not found" };
  }
  // Children cascade via FK (parent_step_id ... on delete cascade).
  const { error } = await db.from("sequence_steps").delete().eq("id", input.stepId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sequences/${(step as { sequence_id: string }).sequence_id}/editor`);
  return { ok: true };
}

// ============================================================
// Queue maintenance (Errors tab retry / Queue cancel)
// ============================================================

export async function retryQueueItemAction(input: { queueId: string }): Promise<ActionResult> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const { error } = await db
    .from("sequence_queue")
    .update({ status: "pending", error: null, scheduled_at: new Date().toISOString() })
    .eq("id", input.queueId)
    .eq("workspace_id", workspaceId)
    .eq("status", "failed");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sequences");
  return { ok: true };
}

export async function cancelQueueItemAction(input: { queueId: string }): Promise<ActionResult> {
  const g = await guarded();
  if (!g.ok) return g;
  const { db, workspaceId } = g;
  const { error } = await db
    .from("sequence_queue")
    .update({ status: "cancelled" })
    .eq("id", input.queueId)
    .eq("workspace_id", workspaceId)
    .in("status", ["pending", "failed"]);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sequences");
  return { ok: true };
}
