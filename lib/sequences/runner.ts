/**
 * Sequence execution engine — drains hiring.sequence_queue.
 *
 * Invoked by /api/sequences/cron every 5 minutes. For each due item:
 *   sequence active? → enrollment active? → optimistic lock → quota +
 *   send-window check → resolve sender + render variables → execute
 *   via Unipile (or create a task for manual steps) → record the
 *   message → schedule the next step (evaluating branches) or
 *   complete the enrollment. Failures retry with backoff (max 3).
 *
 * service_role throughout — cron has no user session.
 */

import "server-only";

import { hiringAdmin } from "@/lib/hiring";
import {
  getLinkedInUser,
  sendChatMessage,
  sendEmail,
  sendLinkedInInvitation,
  startNewChat,
} from "@/lib/integrations/unipile/messaging";
import { enrichCandidateViaUnipileAdmin } from "@/lib/integrations/unipile/profile";
import {
  evaluateCondition,
  loadSteps,
  nextAfter,
  scheduleStep,
  workspaceLinkedinAccount,
  type Db,
  type StepRow,
} from "./engine";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 25;

// Daily caps per step type (Leonar defaults). Overridable per account
// via connected_accounts.account_metadata.quotas (Health tab shows them).
const DAILY_LIMITS: Record<string, { key: string; limit: number }> = {
  linkedin_invitation: { key: "invitations", limit: 40 },
  linkedin_message: { key: "messages", limit: 100 },
  linkedin_inmail: { key: "inmails", limit: 100 },
  whatsapp: { key: "messages", limit: 40 },
  email: { key: "emails", limit: 50 },
};

// Default send window: Mon-Fri 13:00–23:00 UTC (7am–5pm CDMX).
// Override per sequence via settings.send_window.
interface SendWindow {
  days: number[]; // 0=Sun … 6=Sat
  startHourUtc: number;
  endHourUtc: number;
}
const DEFAULT_WINDOW: SendWindow = { days: [1, 2, 3, 4, 5], startHourUtc: 13, endHourUtc: 23 };

function nextWindowStart(window: SendWindow, from: Date): Date {
  const d = new Date(from);
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(d);
    candidate.setUTCDate(d.getUTCDate() + i);
    candidate.setUTCHours(window.startHourUtc, Math.floor(Math.random() * 30), 0, 0);
    if (!window.days.includes(candidate.getUTCDay())) continue;
    if (candidate > from) return candidate;
    // Same day but already past start — still inside window?
    if (
      i === 0 &&
      from.getUTCHours() >= window.startHourUtc &&
      from.getUTCHours() < window.endHourUtc
    ) {
      return from;
    }
  }
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

function insideWindow(window: SendWindow, at: Date): boolean {
  return (
    window.days.includes(at.getUTCDay()) &&
    at.getUTCHours() >= window.startHourUtc &&
    at.getUTCHours() < window.endHourUtc
  );
}

export interface RunnerStats {
  scanned: number;
  executed: number;
  rescheduled: number;
  failed: number;
  completedEnrollments: number;
  errors: string[];
}

interface QueueItem {
  id: string;
  workspace_id: string;
  sequence_id: string;
  enrollment_id: string;
  step_id: string;
  type: string;
  attempts: number;
}

export async function processDueQueue(): Promise<RunnerStats> {
  const db = hiringAdmin();
  const stats: RunnerStats = {
    scanned: 0,
    executed: 0,
    rescheduled: 0,
    failed: 0,
    completedEnrollments: 0,
    errors: [],
  };

  const { data: due } = await db
    .from("sequence_queue")
    .select("id, workspace_id, sequence_id, enrollment_id, step_id, type, attempts")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  for (const item of (due ?? []) as unknown as QueueItem[]) {
    stats.scanned++;
    try {
      await processItem(db, item, stats);
    } catch (e) {
      stats.errors.push(`${item.id}: ${e instanceof Error ? e.message : String(e)}`);
      await failItem(db, item, e instanceof Error ? e.message : String(e), stats);
    }
  }
  return stats;
}

async function processItem(db: Db, item: QueueItem, stats: RunnerStats): Promise<void> {
  // Sequence must be active (paused/draft leave items pending).
  const { data: seq } = await db
    .from("sequences")
    .select("id, status, settings, default_job_id")
    .eq("id", item.sequence_id)
    .maybeSingle();
  if (!seq || seq.status !== "active") return;

  // Enrollment must be active.
  const { data: enrollment } = await db
    .from("sequence_enrollments")
    .select("id, status, entity_id")
    .eq("id", item.enrollment_id)
    .maybeSingle();
  if (!enrollment || enrollment.status !== "active") {
    await db.from("sequence_queue").update({ status: "cancelled" }).eq("id", item.id);
    return;
  }

  // Send window.
  const window =
    (((seq.settings as Record<string, unknown> | null)?.send_window as SendWindow | undefined) ??
      DEFAULT_WINDOW);
  const now = new Date();
  const isSend = item.type in DAILY_LIMITS;
  if (isSend && !insideWindow(window, now)) {
    await db
      .from("sequence_queue")
      .update({ scheduled_at: nextWindowStart(window, now).toISOString() })
      .eq("id", item.id);
    stats.rescheduled++;
    return;
  }

  // Daily quota.
  if (isSend) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count } = await db
      .from("sequence_queue")
      .select("id", { head: true, count: "exact" })
      .eq("workspace_id", item.workspace_id)
      .eq("type", item.type)
      .eq("status", "completed")
      .gte("completed_at", startOfDay.toISOString());
    if ((count ?? 0) >= DAILY_LIMITS[item.type].limit) {
      const tomorrow = nextWindowStart(window, new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000));
      await db
        .from("sequence_queue")
        .update({ scheduled_at: tomorrow.toISOString() })
        .eq("id", item.id);
      stats.rescheduled++;
      return;
    }
  }

  // Optimistic lock — only one runner instance executes the item.
  const { data: locked } = await db
    .from("sequence_queue")
    .update({
      status: "processing",
      started_at: now.toISOString(),
      attempts: item.attempts + 1,
    })
    .eq("id", item.id)
    .eq("status", "pending")
    .select("id");
  if (!locked || locked.length === 0) return;

  // Load step + candidate.
  const steps = await loadSteps(db, item.sequence_id);
  const step = steps.find((s) => s.id === item.step_id);
  if (!step) {
    await db
      .from("sequence_queue")
      .update({ status: "cancelled", error: "step deleted" })
      .eq("id", item.id);
    return;
  }
  const { data: candidate } = await db
    .from("candidates")
    .select(
      "id, full_name, first_name, last_name, email, email_secondary, phone, headline, current_position, current_company_name, linkedin_url, linkedin_public_id",
    )
    .eq("id", enrollment.entity_id as string)
    .maybeSingle();
  if (!candidate) {
    await db
      .from("sequence_queue")
      .update({ status: "cancelled", error: "candidate deleted" })
      .eq("id", item.id);
    return;
  }

  // Sender + variables.
  const sender = await resolveSender(db, item.workspace_id, step);
  const { data: job } = seq.default_job_id
    ? await db.from("jobs").select("title").eq("id", seq.default_job_id as string).maybeSingle()
    : { data: null };
  const render = (tpl: string | null) =>
    renderVariables(tpl ?? "", {
      candidate,
      jobTitle: (job?.title as string | undefined) ?? null,
      sender,
    });

  // Manual mode short-circuits to a task regardless of kind.
  const effectiveKind = step.execution_mode === "manual" ? "manual_task" : step.kind;

  const execution = await executeStep(db, {
    kind: effectiveKind,
    step,
    item,
    candidate,
    senderUnipileId: sender?.unipileAccountId ?? null,
    subject: render(step.subject_template),
    body: render(step.body_template ?? step.task_body),
  });

  if (!execution.ok) {
    await failItem(db, item, execution.error, stats);
    return;
  }

  // Mark completed (+ payload for Health attribution).
  await db
    .from("sequence_queue")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      error: null,
      payload: { sender_account_id: sender?.accountRowId ?? null, ...execution.payload },
    })
    .eq("id", item.id);
  stats.executed++;

  // Next step (evaluating forks) or complete the enrollment.
  const next = nextAfter(steps, step);
  if (!next) {
    await db
      .from("sequence_enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        next_run_at: null,
      })
      .eq("id", item.enrollment_id);
    stats.completedEnrollments++;
    return;
  }
  let upcoming: StepRow | null;
  if (next.kind === "step") {
    upcoming = next.step;
  } else {
    const linkedinAccountId = await workspaceLinkedinAccount(db, item.workspace_id);
    const pass = await evaluateCondition(db, next.condition, {
      workspaceId: item.workspace_id,
      candidateId: candidate.id as string,
      linkedinAccountId,
    });
    upcoming = pass ? next.yes : next.no;
  }
  if (!upcoming) {
    await db
      .from("sequence_enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        next_run_at: null,
      })
      .eq("id", item.enrollment_id);
    stats.completedEnrollments++;
    return;
  }
  await scheduleStep(db, {
    workspaceId: item.workspace_id,
    sequenceId: item.sequence_id,
    enrollmentId: item.enrollment_id,
    step: upcoming,
    baseTime: new Date(),
  });
}

async function failItem(db: Db, item: QueueItem, error: string, stats: RunnerStats): Promise<void> {
  const attempts = item.attempts + 1;
  if (attempts < MAX_ATTEMPTS) {
    // Backoff: 30min × attempt.
    await db
      .from("sequence_queue")
      .update({
        status: "pending",
        error,
        scheduled_at: new Date(Date.now() + attempts * 30 * 60_000).toISOString(),
      })
      .eq("id", item.id);
    stats.rescheduled++;
  } else {
    await db.from("sequence_queue").update({ status: "failed", error }).eq("id", item.id);
    stats.failed++;
  }
}

// ============================================================
// Sender + variables
// ============================================================

interface SenderInfo {
  accountRowId: string;
  unipileAccountId: string;
  label: string;
}

const PROVIDER_FOR_KIND: Record<string, string[]> = {
  email: ["GOOGLE", "GOOGLE_OAUTH", "OUTLOOK", "IMAP"],
  linkedin_message: ["LINKEDIN"],
  linkedin_invitation: ["LINKEDIN"],
  linkedin_inmail: ["LINKEDIN"],
  whatsapp: ["WHATSAPP"],
};

async function resolveSender(
  db: Db,
  workspaceId: string,
  step: StepRow,
): Promise<SenderInfo | null> {
  const providers = PROVIDER_FOR_KIND[step.kind] ?? ["LINKEDIN"];
  let query = db
    .from("connected_accounts")
    .select("id, unipile_account_id, account_metadata")
    .eq("workspace_id", workspaceId)
    .eq("status", "OK")
    .in("provider", providers);
  if (step.sender_account_id && !step.sender_rotation) {
    query = query.eq("id", step.sender_account_id);
  }
  const { data } = await query;
  if (!data || data.length === 0) return null;
  // Rotation = pick pseudo-randomly; single account workspaces unaffected.
  const pick = step.sender_rotation ? data[Math.floor(Math.random() * data.length)] : data[0];
  const meta = (pick.account_metadata as Record<string, unknown> | null) ?? {};
  return {
    accountRowId: pick.id as string,
    unipileAccountId: pick.unipile_account_id as string,
    label: ((meta.name as string) ?? (meta.email as string) ?? "") || "",
  };
}

function renderVariables(
  template: string,
  ctx: {
    candidate: Record<string, unknown>;
    jobTitle: string | null;
    sender: SenderInfo | null;
  },
): string {
  const c = ctx.candidate;
  const fullName = ((c.full_name as string) ?? "").trim();
  const firstName = ((c.first_name as string) ?? fullName.split(" ")[0] ?? "").trim();
  const lastName =
    ((c.last_name as string) ?? fullName.split(" ").slice(1).join(" ") ?? "").trim();
  const senderParts = (ctx.sender?.label ?? "").split(" ");
  const values: Record<string, string> = {
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    fullName,
    full_name: fullName,
    email: ((c.email as string) ?? (c.email_secondary as string) ?? "").trim(),
    phone: ((c.phone as string) ?? "").trim(),
    title: ((c.current_position as string) ?? (c.headline as string) ?? "").trim(),
    linkedinUrl: ((c.linkedin_url as string) ?? "").trim(),
    companyName: ((c.current_company_name as string) ?? "").trim(),
    jobPostingTitle: ctx.jobTitle ?? "",
    senderFirstName: senderParts[0] ?? "",
    senderLastName: senderParts.slice(1).join(" "),
    senderFullName: ctx.sender?.label ?? "",
    senderEmail: ctx.sender?.label.includes("@") ? ctx.sender.label : "",
  };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => {
    return key in values ? values[key] : m;
  });
}

// ============================================================
// Step execution
// ============================================================

type ExecResult =
  | { ok: true; payload?: Record<string, unknown> }
  | { ok: false; error: string };

async function executeStep(
  db: Db,
  input: {
    kind: string;
    step: StepRow;
    item: QueueItem;
    candidate: Record<string, unknown>;
    senderUnipileId: string | null;
    subject: string;
    body: string;
  },
): Promise<ExecResult> {
  const { kind, candidate, item } = input;

  switch (kind) {
    case "manual_task": {
      await db.from("tasks").insert({
        workspace_id: item.workspace_id,
        title:
          input.step.task_title ??
          `Sequence step: ${input.step.kind} — ${(candidate.full_name as string) ?? ""}`,
        body: input.body || null,
        status: "open",
        priority: "normal",
        entity_type: "candidate",
        entity_id: candidate.id as string,
        due_at: new Date().toISOString(),
      });
      return { ok: true, payload: { manual: true } };
    }

    case "email": {
      const to = ((candidate.email as string) ?? (candidate.email_secondary as string) ?? "").trim();
      if (!to) return { ok: false, error: "Candidate has no email" };
      if (!input.senderUnipileId) return { ok: false, error: "No connected email account" };
      const sent = await sendEmail({
        accountId: input.senderUnipileId,
        to,
        subject: input.subject || undefined,
        body: input.body,
      });
      await recordOutboundMessage(db, item, candidate, "email", input.body, {
        subject: input.subject || null,
        externalId: sent.provider_id ?? null,
        toAddress: to,
      });
      return { ok: true };
    }

    case "linkedin_message":
    case "linkedin_inmail": {
      if (!input.senderUnipileId) return { ok: false, error: "No connected LinkedIn account" };
      const identifier =
        ((candidate.linkedin_public_id as string) ?? (candidate.linkedin_url as string) ?? "").trim();
      if (!identifier) return { ok: false, error: "Candidate has no LinkedIn" };

      // Existing chat? Reply there; otherwise start a new one.
      const { data: conv } = await db
        .from("conversations")
        .select("id, external_id")
        .eq("workspace_id", item.workspace_id)
        .eq("candidate_id", candidate.id as string)
        .eq("channel", "linkedin")
        .not("external_id", "is", null)
        .limit(1);
      let externalMessageId: string | null = null;
      if (conv && conv.length > 0 && kind === "linkedin_message") {
        const sent = await sendChatMessage({
          chatId: conv[0].external_id as string,
          accountId: input.senderUnipileId,
          text: input.body,
        });
        externalMessageId = sent.message_id ?? null;
      } else {
        const user = await getLinkedInUser({
          accountId: input.senderUnipileId,
          identifier,
        });
        if (!user.providerId) return { ok: false, error: "Couldn't resolve LinkedIn member id" };
        const sent = await startNewChat({
          accountId: input.senderUnipileId,
          attendeeProviderId: user.providerId,
          text: input.body,
          inmail: kind === "linkedin_inmail",
        });
        externalMessageId = sent.message_id ?? null;
      }
      await recordOutboundMessage(db, item, candidate, "linkedin", input.body, {
        externalId: externalMessageId,
      });
      return { ok: true };
    }

    case "linkedin_invitation": {
      if (!input.senderUnipileId) return { ok: false, error: "No connected LinkedIn account" };
      const identifier =
        ((candidate.linkedin_public_id as string) ?? (candidate.linkedin_url as string) ?? "").trim();
      if (!identifier) return { ok: false, error: "Candidate has no LinkedIn" };
      const user = await getLinkedInUser({
        accountId: input.senderUnipileId,
        identifier,
      });
      if (!user.providerId) return { ok: false, error: "Couldn't resolve LinkedIn member id" };
      if (user.networkDistance === "FIRST" || user.networkDistance === "DISTANCE_1") {
        // Already connected — invitation is a no-op, count as done.
        return { ok: true, payload: { skipped: "already_connected" } };
      }
      await sendLinkedInInvitation({
        accountId: input.senderUnipileId,
        providerId: user.providerId,
        message: input.body || undefined,
        userEmail: ((candidate.email as string) ?? undefined) || undefined,
      });
      return { ok: true };
    }

    case "email_enrichment": {
      try {
        await enrichCandidateViaUnipileAdmin(item.workspace_id, candidate.id as string);
      } catch {
        // Best-effort: enrichment failing shouldn't kill the sequence.
      }
      const { data: refreshed } = await db
        .from("candidates")
        .select("email, email_secondary")
        .eq("id", candidate.id as string)
        .maybeSingle();
      const found = Boolean(refreshed?.email || refreshed?.email_secondary);
      return { ok: true, payload: { email_found: found } };
    }

    case "linkedin_profile_view":
    case "phone_call":
    case "phone_enrichment":
    case "whatsapp":
      // Not wired yet — visible in the editor but parked.
      return { ok: false, error: `Step type ${kind} is not enabled yet` };

    case "wait":
      return { ok: true };

    default:
      return { ok: false, error: `Unknown step type ${kind}` };
  }
}

/** Write the sent message into conversations/messages so the inbox shows it. */
async function recordOutboundMessage(
  db: Db,
  item: QueueItem,
  candidate: Record<string, unknown>,
  channel: "email" | "linkedin",
  body: string,
  opts: { subject?: string | null; externalId?: string | null; toAddress?: string | null },
): Promise<void> {
  let conversationId: string | null = null;
  const { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("workspace_id", item.workspace_id)
    .eq("candidate_id", candidate.id as string)
    .eq("channel", channel)
    .limit(1);
  if (conv && conv.length > 0) {
    conversationId = conv[0].id as string;
    await db
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
  } else {
    const { data: created } = await db
      .from("conversations")
      .insert({
        workspace_id: item.workspace_id,
        channel,
        external_id: null,
        candidate_id: candidate.id as string,
        attendee_name: (candidate.full_name as string) ?? null,
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      })
      .select("id")
      .single();
    conversationId = (created?.id as string) ?? null;
  }
  if (!conversationId) return;
  await db.from("messages").insert({
    workspace_id: item.workspace_id,
    conversation_id: conversationId,
    channel,
    direction: "outbound",
    external_id: opts.externalId ?? null,
    subject: opts.subject ?? null,
    to_address: opts.toAddress ?? null,
    body,
    sent_at: new Date().toISOString(),
    status: "sent",
    enrollment_id: item.enrollment_id,
    step_id: item.step_id,
  });
}
