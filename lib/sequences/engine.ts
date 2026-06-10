/**
 * Sequence engine primitives shared by the server actions (enroll,
 * pause, duplicate) and the cron runner (lib/sequences/runner.ts).
 *
 * Step graph model (hiring.sequence_steps):
 *   - A "lane" is (parent_step_id, branch_path); steps in a lane are
 *     ordered by `position`. The root lane is (null, null).
 *   - Branching: after step X executes, if steps exist with
 *     parent_step_id = X.id the flow forks; each child lane carries
 *     branch_path ('yes' | 'no') and branch_condition (the condition
 *     that decides which lane runs). Lanes don't re-join (Leonar
 *     semantics).
 *   - Entry conditions: root-level fork — steps with parent_step_id
 *     null and branch_path set, condition evaluated at enroll time.
 */

import "server-only";

import type { hiringAdmin } from "@/lib/hiring";
import { getNetworkDistance } from "@/lib/integrations/unipile/messaging";

export type Db = ReturnType<typeof hiringAdmin>;

export interface StepRow {
  id: string;
  sequence_id: string;
  position: number;
  kind: string;
  delay_minutes: number | null;
  subject_template: string | null;
  body_template: string | null;
  task_title: string | null;
  task_body: string | null;
  config: Record<string, unknown> | null;
  execution_mode: string;
  sender_account_id: string | null;
  sender_rotation: boolean;
  parent_step_id: string | null;
  branch_path: string | null;
  branch_condition: string | null;
}

export const STEP_SELECT =
  "id, sequence_id, position, kind, delay_minutes, subject_template, body_template, task_title, task_body, config, execution_mode, sender_account_id, sender_rotation, parent_step_id, branch_path, branch_condition";

export async function loadSteps(db: Db, sequenceId: string): Promise<StepRow[]> {
  const { data } = await db
    .from("sequence_steps")
    .select(STEP_SELECT)
    .eq("sequence_id", sequenceId)
    .order("position", { ascending: true });
  return (data ?? []) as unknown as StepRow[];
}

function lane(steps: StepRow[], parentId: string | null, branchPath: string | null): StepRow[] {
  return steps
    .filter((s) => s.parent_step_id === parentId && s.branch_path === branchPath)
    .sort((a, b) => a.position - b.position);
}

/** Root entry: either the plain root lane, or an entry-condition fork. */
export function rootEntry(steps: StepRow[]):
  | { kind: "linear"; first: StepRow | null }
  | { kind: "fork"; condition: string; yes: StepRow | null; no: StepRow | null } {
  const linear = lane(steps, null, null);
  if (linear.length > 0) return { kind: "linear", first: linear[0] };
  const yes = lane(steps, null, "yes");
  const no = lane(steps, null, "no");
  const condition = yes[0]?.branch_condition ?? no[0]?.branch_condition ?? null;
  if (condition) return { kind: "fork", condition, yes: yes[0] ?? null, no: no[0] ?? null };
  return { kind: "linear", first: null };
}

/**
 * The step that follows `current`, or a fork decision, or null (end).
 */
export function nextAfter(
  steps: StepRow[],
  current: StepRow,
):
  | { kind: "step"; step: StepRow }
  | { kind: "fork"; condition: string; yes: StepRow | null; no: StepRow | null }
  | null {
  // 1) Children fork? Branch lanes hang off the CURRENT step.
  const yes = lane(steps, current.id, "yes");
  const no = lane(steps, current.id, "no");
  if (yes.length > 0 || no.length > 0) {
    const condition = yes[0]?.branch_condition ?? no[0]?.branch_condition ?? "has_email";
    return { kind: "fork", condition, yes: yes[0] ?? null, no: no[0] ?? null };
  }
  // 2) Next sibling in the same lane.
  const siblings = lane(steps, current.parent_step_id, current.branch_path);
  const next = siblings.find((s) => s.position > current.position);
  return next ? { kind: "step", step: next } : null;
}

// ============================================================
// Condition evaluation
// ============================================================

export async function evaluateCondition(
  db: Db,
  condition: string,
  ctx: {
    workspaceId: string;
    candidateId: string;
    linkedinAccountId?: string | null;
  },
): Promise<boolean> {
  const { data: cand } = await db
    .from("candidates")
    .select("id, email, email_secondary, phone, linkedin_public_id, linkedin_url")
    .eq("id", ctx.candidateId)
    .maybeSingle();
  if (!cand) return false;

  switch (condition) {
    case "has_email":
      return Boolean(cand.email || cand.email_secondary);
    case "has_phone":
      return Boolean(cand.phone);
    case "already_contacted": {
      const { data: conv } = await db
        .from("conversations")
        .select("id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("candidate_id", ctx.candidateId)
        .limit(1);
      return Boolean(conv && conv.length > 0);
    }
    case "connected_on_linkedin": {
      const identifier =
        (cand.linkedin_public_id as string | null) ??
        (cand.linkedin_url as string | null);
      if (!identifier || !ctx.linkedinAccountId) return false;
      const distance = await getNetworkDistance({
        accountId: ctx.linkedinAccountId,
        identifier,
      });
      return distance === "FIRST" || distance === "DISTANCE_1";
    }
    default:
      return false;
  }
}

// ============================================================
// Scheduling
// ============================================================

export function stepDelayMs(step: StepRow): number {
  return Math.max(0, (step.delay_minutes ?? 0) * 60_000);
}

export async function scheduleStep(
  db: Db,
  input: {
    workspaceId: string;
    sequenceId: string;
    enrollmentId: string;
    step: StepRow;
    baseTime: Date;
  },
): Promise<void> {
  const scheduledAt = new Date(input.baseTime.getTime() + stepDelayMs(input.step));
  await db.from("sequence_queue").insert({
    workspace_id: input.workspaceId,
    sequence_id: input.sequenceId,
    enrollment_id: input.enrollmentId,
    step_id: input.step.id,
    type: input.step.kind,
    status: "pending",
    scheduled_at: scheduledAt.toISOString(),
  });
  await db
    .from("sequence_enrollments")
    .update({ current_step_id: input.step.id, next_run_at: scheduledAt.toISOString() })
    .eq("id", input.enrollmentId);
}

/**
 * Resolve the workspace's healthy LinkedIn account (used for
 * connected_on_linkedin checks and as the default sender).
 */
export async function workspaceLinkedinAccount(
  db: Db,
  workspaceId: string,
): Promise<string | null> {
  const { data } = await db
    .from("connected_accounts")
    .select("unipile_account_id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "LINKEDIN")
    .eq("status", "OK")
    .limit(1);
  return (data?.[0]?.unipile_account_id as string | undefined) ?? null;
}

// ============================================================
// Enrollment
// ============================================================

export async function enrollCandidate(
  db: Db,
  input: {
    workspaceId: string;
    sequenceId: string;
    candidateId: string;
    enrolledBy?: string | null;
  },
): Promise<{ ok: true; enrollmentId: string } | { ok: false; error: string }> {
  const steps = await loadSteps(db, input.sequenceId);
  if (steps.length === 0) return { ok: false, error: "Sequence has no steps" };

  const { data: enrollment, error } = await db
    .from("sequence_enrollments")
    .insert({
      workspace_id: input.workspaceId,
      sequence_id: input.sequenceId,
      entity_type: "candidate",
      entity_id: input.candidateId,
      status: "active",
      enrolled_by: input.enrolledBy ?? null,
      enrolled_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !enrollment) {
    const msg = error?.message ?? "enrollment failed";
    return {
      ok: false,
      error: msg.includes("duplicate") ? "Already enrolled in this sequence" : msg,
    };
  }
  const enrollmentId = enrollment.id as string;

  const entry = rootEntry(steps);
  let first: StepRow | null = null;
  if (entry.kind === "linear") {
    first = entry.first;
  } else {
    const linkedinAccountId = await workspaceLinkedinAccount(db, input.workspaceId);
    const pass = await evaluateCondition(db, entry.condition, {
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      linkedinAccountId,
    });
    first = pass ? entry.yes : entry.no;
  }
  if (!first) {
    await db
      .from("sequence_enrollments")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", enrollmentId);
    return { ok: true, enrollmentId };
  }
  await scheduleStep(db, {
    workspaceId: input.workspaceId,
    sequenceId: input.sequenceId,
    enrollmentId,
    step: first,
    baseTime: new Date(),
  });
  return { ok: true, enrollmentId };
}

// ============================================================
// Board stage derivation (Leonar's kanban columns)
// ============================================================

export type BoardStage = "pending" | "not_contacted" | "in_progress" | "replied" | "finished";

export function deriveBoardStage(input: {
  status: string;
  sentCount: number;
  hasFailedQueue: boolean;
}): BoardStage {
  if (input.status === "replied") return "replied";
  if (input.status === "completed") return "finished";
  if (input.status === "failed" || input.hasFailedQueue) return "not_contacted";
  if (input.sentCount > 0) return "in_progress";
  return "pending";
}
