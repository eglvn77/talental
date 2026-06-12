/**
 * Unipile → ATS ingest pipeline.
 *
 * Single idempotent entry point used by BOTH the realtime webhook
 * (app/api/unipile/webhook) and the historical backfill. Every
 * message flows through `ingestNormalizedMessage`, which:
 *
 *   1. Resolves the workspace via hiring.connected_accounts.
 *   2. Upserts the conversation + message (dedup on channel+external_id —
 *      a duplicate message short-circuits all side effects, which is
 *      what makes webhook retries and webhook/backfill overlap safe).
 *   3. Links the conversation to a candidate (LinkedIn slug → name).
 *   4. OUTBOUND to an unknown person = outreach started elsewhere
 *      (today: Pin sending from Emanuel's accounts) → create the
 *      candidate (full profile via Unipile when under the daily cap)
 *      and an application at `Contacted` when the job is inferable.
 *   5. INBOUND from a known candidate → advance their application to
 *      `Replied` (advance-only) + stop-on-reply for active sequence
 *      enrollments.
 *
 * Runs on service_role (hiringAdmin) — webhooks have no user session.
 * Anything ambiguous lands in hiring.agent_review_queue instead of
 * guessing; the recruiting-coordinator routine reports those to Slack.
 */

import "server-only";

import { hiringAdmin } from "@/lib/hiring";
import { canonicalizeLinkedinUrl, linkedinPublicId } from "@/lib/linkedin";
import { enrichCandidateViaUnipileAdmin } from "./profile";
import {
  listChatAttendees,
  listChatMessages,
  listChats,
  type UnipileChat,
  type UnipileChatAttendee,
} from "./messaging";

// Candidate source row for Pin (hiring.sources, workspace talental).
// Monitor-created candidates are attributed to Pin because today Pin
// is the only system sending outreach from the connected accounts.
const PIN_SOURCE_ID = "1af52289-ea25-453c-bda5-67064045a23d";

type Db = ReturnType<typeof hiringAdmin>;

// ============================================================
// Normalized shape shared by webhook + backfill
// ============================================================

export type IngestChannel = "linkedin" | "email" | "whatsapp" | "other";

export interface NormalizedMessage {
  unipileAccountId: string;
  channel: IngestChannel;
  chatExternalId: string;
  messageExternalId: string;
  direction: "inbound" | "outbound";
  text: string | null;
  subject?: string | null;
  sentAt: string; // ISO
  attendeeProviderId?: string | null;
  attendeeName?: string | null;
  attendeeProfileUrl?: string | null;
  raw: unknown;
}

export interface IngestResult {
  skipped?: string;
  duplicate?: boolean;
  conversationId?: string;
  candidateId?: string | null;
  createdCandidate?: boolean;
  createdApplication?: boolean;
  movedToReplied?: boolean;
  queuedForReview?: string;
}

export function mapAccountTypeToChannel(accountType?: string): IngestChannel {
  switch ((accountType ?? "").toUpperCase()) {
    case "LINKEDIN":
      return "linkedin";
    case "WHATSAPP":
      return "whatsapp";
    case "GOOGLE":
    case "GOOGLE_OAUTH":
    case "OUTLOOK":
    case "IMAP":
    case "MAIL":
      return "email";
    default:
      return "other";
  }
}

// ============================================================
// Webhook payload → NormalizedMessage
// ============================================================

interface WebhookAttendee {
  attendee_id?: string;
  attendee_name?: string;
  attendee_provider_id?: string;
  attendee_profile_url?: string;
}

export interface UnipileMessagingWebhookPayload {
  event?: string;
  account_id?: string;
  account_type?: string;
  account_info?: { user_id?: string; [key: string]: unknown };
  chat_id?: string;
  message_id?: string;
  message?: string | null;
  subject?: string | null;
  timestamp?: string;
  sender?: WebhookAttendee;
  attendees?: WebhookAttendee[];
  [key: string]: unknown;
}

/**
 * Returns null for events we deliberately don't ingest (reactions,
 * read receipts, edits, deletes) or payloads missing the essentials.
 */
export function normalizeWebhookPayload(
  payload: UnipileMessagingWebhookPayload,
): NormalizedMessage | null {
  if ((payload.event ?? "message_received") !== "message_received") return null;
  if (!payload.account_id || !payload.chat_id || !payload.message_id) {
    return null;
  }

  const selfId = payload.account_info?.user_id ?? null;
  const senderId = payload.sender?.attendee_provider_id ?? null;
  const direction: "inbound" | "outbound" =
    selfId && senderId && selfId === senderId ? "outbound" : "inbound";

  // The human counterpart: for outbound it's the first non-self
  // attendee, for inbound it's the sender.
  let counterpart: WebhookAttendee | undefined;
  if (direction === "inbound") {
    counterpart = payload.sender;
  } else {
    counterpart = (payload.attendees ?? []).find(
      (a) => a.attendee_provider_id && a.attendee_provider_id !== selfId,
    );
  }

  return {
    unipileAccountId: payload.account_id,
    channel: mapAccountTypeToChannel(payload.account_type),
    chatExternalId: payload.chat_id,
    messageExternalId: payload.message_id,
    direction,
    text: payload.message ?? null,
    subject: payload.subject ?? null,
    sentAt: payload.timestamp ?? new Date().toISOString(),
    attendeeProviderId: counterpart?.attendee_provider_id ?? null,
    attendeeName: counterpart?.attendee_name ?? null,
    attendeeProfileUrl: counterpart?.attendee_profile_url ?? null,
    raw: payload,
  };
}

// ============================================================
// Email webhook payload → NormalizedMessage
// ============================================================

interface EmailAttendee {
  identifier?: string; // the email address
  display_name?: string;
}

export interface UnipileEmailWebhookPayload {
  event?: string; // "mail_received" | "mail_sent" | …
  account_id?: string;
  account_type?: string;
  email_id?: string;
  message_id?: string;
  provider_id?: string;
  thread_id?: string;
  date?: string;
  subject?: string | null;
  body?: string | null;
  body_plain?: string | null;
  from_attendee?: EmailAttendee;
  to_attendees?: EmailAttendee[];
  [key: string]: unknown;
}

/** True when a webhook body looks like an email event, not a chat one. */
export function isEmailWebhook(payload: Record<string, unknown>): boolean {
  if (typeof payload.event === "string" && payload.event.startsWith("mail")) {
    return true;
  }
  return Boolean(payload.email_id) && !payload.chat_id;
}

/**
 * Map a Unipile email webhook into the channel-agnostic
 * NormalizedMessage the ingest pipeline consumes. The conversation is
 * keyed by thread (falling back to the counterpart address), so a
 * back-and-forth email thread reads as one conversation. Defensive
 * about field names — Unipile's email payload differs across providers.
 */
export function normalizeEmailWebhook(
  payload: UnipileEmailWebhookPayload,
): NormalizedMessage | null {
  const accountId = payload.account_id;
  const messageId = payload.email_id ?? payload.message_id;
  if (!accountId || !messageId) return null;

  const outbound = (payload.event ?? "").toLowerCase().includes("sent");
  // Emails WE sent through the API are already recorded by the send
  // path (composer / sequence runner) — ingesting the echo would
  // duplicate them because the send response carries provider_id
  // while the webhook carries email_id.
  if (outbound && payload.origin === "unipile") return null;
  const direction: "inbound" | "outbound" = outbound ? "outbound" : "inbound";
  const counterpart = outbound
    ? payload.to_attendees?.[0]
    : payload.from_attendee;
  const counterpartEmail = (counterpart?.identifier ?? "").trim().toLowerCase();

  const thread = payload.thread_id ?? (counterpartEmail || messageId);
  const text = payload.body_plain ?? payload.body ?? null;

  return {
    unipileAccountId: accountId,
    channel: "email",
    chatExternalId: thread,
    messageExternalId: messageId,
    direction,
    text,
    subject: payload.subject ?? null,
    sentAt: payload.date ?? new Date().toISOString(),
    attendeeProviderId: counterpartEmail || null,
    attendeeName: counterpart?.display_name ?? null,
    attendeeProfileUrl: null,
    raw: payload,
  };
}

// ============================================================
// Helpers
// ============================================================

function normText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

async function queueReview(
  db: Db,
  workspaceId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db
    .from("agent_review_queue")
    .insert({ workspace_id: workspaceId, kind, payload });
}

/**
 * Candidate matching cascade (LinkedIn slug → canonical URL → unique
 * exact full name). Email matching is reserved for the email channel.
 */
async function matchCandidate(
  db: Db,
  workspaceId: string,
  n: NormalizedMessage,
): Promise<{ id: string } | { ambiguous: true } | null> {
  // Email channel: the counterpart identifier IS an email address —
  // match it against candidates.email (stored lowercased on every
  // write path, so a case-folded eq matches).
  if (n.channel === "email") {
    const email = (n.attendeeProviderId ?? "").trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const { data } = await db
        .from("candidates")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("email", email)
        .limit(2);
      if (data && data.length === 1) return { id: data[0].id as string };
      if (data && data.length > 1) return { ambiguous: true };
    }
    // Fall through to name matching below for emails we don't know yet.
  }
  // WhatsApp: the counterpart id is the phone ("521331…@s.whatsapp.net").
  // Match by digit suffix against candidates.phone (normalized digits).
  if (n.channel === "whatsapp" && n.attendeeProviderId) {
    const digits = n.attendeeProviderId.split("@")[0].replace(/\D/g, "");
    const last10 = digits.slice(-10);
    if (last10.length === 10) {
      const { data } = await db
        .from("candidates")
        .select("id, phone")
        .eq("workspace_id", workspaceId)
        .ilike("phone", `%${last10}%`)
        .limit(2);
      if (data && data.length === 1) return { id: data[0].id as string };
      if (data && data.length > 1) return { ambiguous: true };
    }
  }
  const slug = n.attendeeProfileUrl ? linkedinPublicId(n.attendeeProfileUrl) : null;
  if (slug) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("linkedin_public_id", slug)
      .limit(2);
    if (data && data.length === 1) return { id: data[0].id as string };
    if (data && data.length > 1) return { ambiguous: true };
  }
  const canonical = n.attendeeProfileUrl
    ? canonicalizeLinkedinUrl(n.attendeeProfileUrl)
    : null;
  if (canonical) {
    const { data } = await db
      .from("candidates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("linkedin_url", `%${canonical.replace(/^https?:\/\//, "")}%`)
      .limit(2);
    if (data && data.length === 1) return { id: data[0].id as string };
    if (data && data.length > 1) return { ambiguous: true };
  }
  if (n.attendeeName && n.attendeeName.trim().includes(" ")) {
    const { data } = await db
      .from("candidates")
      .select("id, full_name")
      .eq("workspace_id", workspaceId)
      .ilike("full_name", n.attendeeName.trim())
      .limit(2);
    if (data && data.length === 1) return { id: data[0].id as string };
    if (data && data.length > 1) return { ambiguous: true };
  }
  return null;
}

/**
 * Infer which job an outreach message belongs to by scanning open job
 * titles against the message text. Single hit → that job; zero or
 * multiple → null (caller queues a review entry).
 */
async function inferJobFromText(
  db: Db,
  workspaceId: string,
  text: string | null,
): Promise<{ id: string; title: string } | null> {
  if (!text) return null;
  const { data: jobs } = await db
    .from("jobs")
    .select("id, title")
    .eq("workspace_id", workspaceId)
    .is("closed_at", null);
  if (!jobs?.length) return null;
  const haystack = normText(text);
  const hits = jobs.filter(
    (j) => j.title && haystack.includes(normText(j.title as string)),
  );
  return hits.length === 1
    ? { id: hits[0].id as string, title: hits[0].title as string }
    : null;
}

/** Advance-only stage move. Returns true when the row actually moved. */
async function advanceApplication(
  db: Db,
  applicationId: string,
  jobId: string,
  targetStageName: string,
): Promise<boolean> {
  const { data: stages } = await db
    .from("pipeline_stages")
    .select("id, name, position")
    .eq("job_id", jobId);
  const target = stages?.find((s) => s.name === targetStageName);
  if (!target) return false;
  const { data: app } = await db
    .from("applications")
    .select("id, stage_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return false;
  const current = stages?.find((s) => s.id === app.stage_id);
  if (current && (current.position as number) >= (target.position as number)) {
    return false; // already there or further along — never retreat
  }
  const { error } = await db
    .from("applications")
    .update({
      stage_id: target.id,
      status_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);
  return !error;
}

/** Stop-on-reply: mark active enrollments replied + cancel queued work. */
async function stopEnrollmentsOnReply(
  db: Db,
  workspaceId: string,
  candidateId: string,
): Promise<void> {
  const { data: enrollments } = await db
    .from("sequence_enrollments")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "candidate")
    .eq("entity_id", candidateId)
    .in("status", ["active", "paused"]);
  if (!enrollments?.length) return;
  const ids = enrollments.map((e) => e.id as string);
  await db
    .from("sequence_enrollments")
    .update({ status: "replied", replied_at: new Date().toISOString() })
    .in("id", ids);
  await db
    .from("sequence_queue")
    .update({ status: "cancelled" })
    .in("enrollment_id", ids)
    .in("status", ["pending", "processing"]);
}

// ============================================================
// Core ingest
// ============================================================

export async function ingestNormalizedMessage(
  n: NormalizedMessage,
): Promise<IngestResult> {
  // service_role: webhook/backfill context, workspace derives from the
  // connected account that owns the event — never from user input.
  const db = hiringAdmin();

  const { data: account } = await db
    .from("connected_accounts")
    .select("id, workspace_id")
    .eq("unipile_account_id", n.unipileAccountId)
    .maybeSingle();
  if (!account) return { skipped: "unknown_account" };
  const workspaceId = account.workspace_id as string;

  // ---- conversation upsert ------------------------------------------
  const { data: existingConv } = await db
    .from("conversations")
    .select("id, candidate_id, last_message_at, unread_count")
    .eq("channel", n.channel)
    .eq("external_id", n.chatExternalId)
    .maybeSingle();

  let conversationId: string;
  let candidateId = (existingConv?.candidate_id as string | null) ?? null;
  if (existingConv) {
    conversationId = existingConv.id as string;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const prevLast = existingConv.last_message_at as string | null;
    if (!prevLast || prevLast < n.sentAt) patch.last_message_at = n.sentAt;
    if (n.attendeeName) patch.attendee_name = n.attendeeName;
    if (n.attendeeProfileUrl ?? n.attendeeProviderId) {
      patch.attendee_identifier = n.attendeeProfileUrl ?? n.attendeeProviderId;
    }
    if (n.direction === "inbound") {
      patch.unread_count = ((existingConv.unread_count as number) ?? 0) + 1;
    }
    await db.from("conversations").update(patch).eq("id", conversationId);
  } else {
    const { data: created, error } = await db
      .from("conversations")
      .insert({
        workspace_id: workspaceId,
        channel: n.channel,
        external_id: n.chatExternalId,
        subject: n.subject ?? null,
        attendee_name: n.attendeeName ?? null,
        attendee_identifier: n.attendeeProfileUrl ?? n.attendeeProviderId ?? null,
        last_message_at: n.sentAt,
        unread_count: n.direction === "inbound" ? 1 : 0,
      })
      .select("id")
      .single();
    if (error || !created) {
      // Unique race with a concurrent webhook delivery — re-read.
      const { data: again } = await db
        .from("conversations")
        .select("id, candidate_id")
        .eq("channel", n.channel)
        .eq("external_id", n.chatExternalId)
        .maybeSingle();
      if (!again) return { skipped: `conversation_insert_failed: ${error?.message}` };
      conversationId = again.id as string;
      candidateId = (again.candidate_id as string | null) ?? null;
    } else {
      conversationId = created.id as string;
    }
  }

  // ---- message insert (idempotency gate) ----------------------------
  const { data: inserted } = await db
    .from("messages")
    .upsert(
      {
        workspace_id: workspaceId,
        conversation_id: conversationId,
        external_id: n.messageExternalId,
        channel: n.channel,
        direction: n.direction,
        from_address: n.direction === "outbound" ? null : n.attendeeProviderId,
        to_address: n.direction === "outbound" ? n.attendeeProviderId : null,
        subject: n.subject ?? null,
        body: n.text,
        sent_at: n.sentAt,
        status: "sent",
        raw: n.raw ?? {},
      },
      { onConflict: "channel,external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (!inserted || inserted.length === 0) {
    // Already ingested (webhook retry or backfill overlap) — no side
    // effects the second time around.
    return { duplicate: true, conversationId, candidateId };
  }

  // ---- candidate linking --------------------------------------------
  let createdCandidate = false;
  let queuedForReview: string | undefined;
  if (!candidateId) {
    const match = await matchCandidate(db, workspaceId, n);
    if (match && "id" in match) {
      candidateId = match.id;
    } else if (match && "ambiguous" in match) {
      queuedForReview = "candidate_match_ambiguous";
      await queueReview(db, workspaceId, queuedForReview, {
        conversation_id: conversationId,
        attendee_name: n.attendeeName,
        attendee_profile_url: n.attendeeProfileUrl,
        channel: n.channel,
      });
    }
  }

  // ---- outbound to unknown = outreach started (Pin) ------------------
  let createdApplication = false;
  if (
    !candidateId &&
    !queuedForReview &&
    n.direction === "outbound" &&
    n.channel === "linkedin" &&
    (n.attendeeName || n.attendeeProfileUrl)
  ) {
    const slug = n.attendeeProfileUrl ? linkedinPublicId(n.attendeeProfileUrl) : null;
    // Chat attendees often expose the provider id (ACoAA…) instead of
    // the public slug — that's NOT a public_id and it's case sensitive.
    const slugIsProviderId = Boolean(slug && /^acoaa/i.test(slug));
    const fullName = n.attendeeName?.trim() || (!slugIsProviderId ? slug : null) || "Unknown";
    const { data: cand, error: candErr } = await db
      .from("candidates")
      .insert({
        workspace_id: workspaceId,
        full_name: fullName,
        linkedin_url: n.attendeeProfileUrl
          ? canonicalizeLinkedinUrl(n.attendeeProfileUrl)
          : null,
        linkedin_public_id: slugIsProviderId ? null : slug,
        default_source: "linkedin",
        source_id: PIN_SOURCE_ID,
        needs_embedding: true,
      })
      .select("id")
      .single();
    if (!candErr && cand) {
      candidateId = cand.id as string;
      createdCandidate = true;
      // Full profile (experience/education/skills → parsed_profile).
      // Cap-aware: enrichCandidateViaUnipileAdmin enforces the daily
      // Unipile fetch budget; over-cap candidates stay minimal and can
      // be enriched later from the UI. Fetch by the RAW provider id
      // when we have it (case sensitive — never canonicalized).
      try {
        await enrichCandidateViaUnipileAdmin(
          workspaceId,
          candidateId,
          n.attendeeProviderId ?? undefined,
        );
      } catch (e) {
        console.warn("[ingest] enrich after create failed:", e);
      }
      const job = await inferJobFromText(db, workspaceId, n.text);
      if (job) {
        const { data: stage } = await db
          .from("pipeline_stages")
          .select("id")
          .eq("job_id", job.id)
          .eq("name", "Contacted")
          .maybeSingle();
        if (stage) {
          const { error: appErr } = await db.from("applications").insert({
            workspace_id: workspaceId,
            candidate_id: candidateId,
            job_id: job.id,
            source: "linkedin",
            source_meta: { via: "unipile_monitor" },
            stage_id: stage.id,
            applied_at: n.sentAt,
            status_changed_at: new Date().toISOString(),
          });
          createdApplication = !appErr;
        }
      } else {
        queuedForReview = "outreach_job_unresolved";
        await queueReview(db, workspaceId, queuedForReview, {
          candidate_id: candidateId,
          candidate_name: fullName,
          conversation_id: conversationId,
          snippet: (n.text ?? "").slice(0, 280),
        });
      }
    }
  }

  if (candidateId && !existingConv?.candidate_id) {
    await db
      .from("conversations")
      .update({ candidate_id: candidateId })
      .eq("id", conversationId);
  }

  // ---- inbound from known candidate → Replied + stop sequences -------
  let movedToReplied = false;
  if (n.direction === "inbound" && candidateId) {
    const { data: apps } = await db
      .from("applications")
      .select("id, job_id, jobs!inner(closed_at)")
      .eq("candidate_id", candidateId)
      .is("jobs.closed_at", null);
    if (apps && apps.length === 1) {
      movedToReplied = await advanceApplication(
        db,
        apps[0].id as string,
        apps[0].job_id as string,
        "Replied",
      );
    } else if (apps && apps.length > 1) {
      queuedForReview = "reply_ambiguous_job";
      await queueReview(db, workspaceId, queuedForReview, {
        candidate_id: candidateId,
        conversation_id: conversationId,
        open_applications: apps.length,
      });
    }
    await stopEnrollmentsOnReply(db, workspaceId, candidateId);
  }

  return {
    conversationId,
    candidateId,
    createdCandidate,
    createdApplication,
    movedToReplied,
    queuedForReview,
  };
}

// ============================================================
// Backfill — historical chats → same pipeline
// ============================================================

export interface BackfillStats {
  chatsScanned: number;
  messagesIngested: number;
  duplicates: number;
  candidatesCreated: number;
  applicationsCreated: number;
  reviewQueued: number;
  errors: number;
}

/**
 * One-shot import of recent chats for a connected account. Walks
 * chats newest-first, pulls the latest `messagesPerChat` messages of
 * each 1:1 chat, and funnels them through ingestNormalizedMessage in
 * chronological order (so outreach-creation happens before replies).
 *
 * Safe to re-run: dedup on messages(channel, external_id).
 */
export async function backfillAccountChats(opts: {
  unipileAccountId: string;
  accountType?: string;
  maxChats?: number;
  messagesPerChat?: number;
}): Promise<BackfillStats> {
  const stats: BackfillStats = {
    chatsScanned: 0,
    messagesIngested: 0,
    duplicates: 0,
    candidatesCreated: 0,
    applicationsCreated: 0,
    reviewQueued: 0,
    errors: 0,
  };
  const maxChats = opts.maxChats ?? 200;
  const perChat = opts.messagesPerChat ?? 25;
  const channel = mapAccountTypeToChannel(opts.accountType ?? "LINKEDIN");

  let cursor: string | null = null;
  while (stats.chatsScanned < maxChats) {
    const page = await listChats({
      accountId: opts.unipileAccountId,
      cursor: cursor ?? undefined,
      limit: Math.min(50, maxChats - stats.chatsScanned),
    });
    for (const chat of page.items) {
      stats.chatsScanned++;
      try {
        await backfillSingleChat(chat, channel, opts.unipileAccountId, perChat, stats);
      } catch (e) {
        stats.errors++;
        console.error("[backfill] chat failed:", chat.id, e);
      }
    }
    cursor = page.cursor;
    if (!cursor || page.items.length === 0) break;
  }
  return stats;
}

async function backfillSingleChat(
  chat: UnipileChat,
  channel: IngestChannel,
  unipileAccountId: string,
  perChat: number,
  stats: BackfillStats,
): Promise<void> {
  // Only 1:1 chats — groups aren't candidate conversations.
  if ((chat.type ?? 0) !== 0) return;

  const attendees = await listChatAttendees(chat.id);
  const counterpart: UnipileChatAttendee | undefined = attendees.items.find(
    (a) => a.is_self !== 1,
  );

  const messages = await listChatMessages(chat.id, { limit: perChat });
  // Unipile returns newest-first; ingest oldest-first so the outbound
  // first-touch creates the candidate before their reply is processed.
  const ordered = [...messages.items].reverse();
  for (const m of ordered) {
    const normalized: NormalizedMessage = {
      unipileAccountId,
      channel,
      chatExternalId: chat.id,
      messageExternalId: m.id,
      direction: m.is_sender === 1 ? "outbound" : "inbound",
      text: m.text ?? null,
      subject: m.subject ?? null,
      sentAt: m.timestamp ?? new Date().toISOString(),
      attendeeProviderId: counterpart?.provider_id ?? chat.attendee_provider_id ?? null,
      attendeeName: counterpart?.name ?? chat.name ?? null,
      attendeeProfileUrl: counterpart?.profile_url ?? null,
      raw: { backfill: true, message: m },
    };
    const res = await ingestNormalizedMessage(normalized);
    if (res.duplicate) stats.duplicates++;
    else if (!res.skipped) stats.messagesIngested++;
    if (res.createdCandidate) stats.candidatesCreated++;
    if (res.createdApplication) stats.applicationsCreated++;
    if (res.queuedForReview) stats.reviewQueued++;
  }
}
