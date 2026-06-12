/**
 * Unipile messaging surface — chats, messages, invitations, email.
 *
 * Complements unipile/client.ts (accounts + hosted auth) and
 * unipile/profile.ts (LinkedIn profile fetch). Everything here goes
 * through the v1 API: messaging endpoints never moved to v2.
 *
 * Send endpoints use multipart/form-data (Unipile's documented
 * format — JSON bodies are only reliable on /users/invite and
 * /webhooks). List endpoints are plain GET + query params.
 */

import "server-only";

// ============================================================
// Config (same env contract as client.ts / profile.ts)
// ============================================================

function unipileBaseUrl(): string {
  const dsn = process.env.UNIPILE_DSN;
  if (!dsn) throw new Error("UNIPILE_DSN env var not set");
  return `https://${dsn}/api/v1`;
}

function unipileApiKey(): string {
  const key = process.env.UNIPILE_API_KEY;
  if (!key) throw new Error("UNIPILE_API_KEY env var not set");
  return key;
}

export class UnipileMessagingError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "UnipileMessagingError";
    this.status = status;
    this.body = body;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }
  return fallback;
}

async function getJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${unipileBaseUrl()}${path}${qs}`;
  const res = await fetch(url, {
    headers: { "X-API-KEY": unipileApiKey(), Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await parseBody(res);
  if (!res.ok) {
    throw new UnipileMessagingError(
      errorMessage(payload, `Unipile GET ${path} failed: ${res.status}`),
      res.status,
      payload,
    );
  }
  return payload as T;
}

async function postForm<T>(path: string, fields: Record<string, string>): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${unipileBaseUrl()}${path}`, {
    method: "POST",
    headers: { "X-API-KEY": unipileApiKey(), Accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const payload = await parseBody(res);
  if (!res.ok) {
    throw new UnipileMessagingError(
      errorMessage(payload, `Unipile POST ${path} failed: ${res.status}`),
      res.status,
      payload,
    );
  }
  return payload as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${unipileBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "X-API-KEY": unipileApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await parseBody(res);
  if (!res.ok) {
    throw new UnipileMessagingError(
      errorMessage(payload, `Unipile POST ${path} failed: ${res.status}`),
      res.status,
      payload,
    );
  }
  return payload as T;
}

// ============================================================
// Shapes (lenient — Unipile evolves; we read what we need)
// ============================================================

export interface UnipileChat {
  object?: string;
  id: string;
  account_id: string;
  account_type?: string; // LINKEDIN, WHATSAPP, ...
  provider_id?: string;
  attendee_provider_id?: string;
  name?: string | null;
  /** 0 = 1:1, 1 = group, 2 = channel-ish. We only ingest 1:1. */
  type?: number;
  timestamp?: string | null;
  unread_count?: number;
  archived?: number;
  [key: string]: unknown;
}

export interface UnipileChatMessage {
  object?: string;
  id: string;
  chat_id?: string;
  text?: string | null;
  timestamp?: string;
  /** 1 when the connected account authored the message. */
  is_sender?: number;
  sender_id?: string;
  provider_id?: string;
  subject?: string | null;
  attachments?: unknown[];
  [key: string]: unknown;
}

export interface UnipileChatAttendee {
  object?: string;
  id: string;
  provider_id?: string;
  name?: string | null;
  is_self?: number;
  profile_url?: string | null;
  picture_url?: string | null;
  specifics?: { member_urn?: string; [key: string]: unknown };
  [key: string]: unknown;
}

interface Paginated<T> {
  items: T[];
  cursor: string | null;
}

// ============================================================
// Chats + messages (read)
// ============================================================

export function listChats(opts: {
  accountId?: string;
  cursor?: string;
  after?: string;
  limit?: number;
}): Promise<Paginated<UnipileChat>> {
  const params: Record<string, string> = {};
  if (opts.accountId) params.account_id = opts.accountId;
  if (opts.cursor) params.cursor = opts.cursor;
  if (opts.after) params.after = opts.after;
  params.limit = String(opts.limit ?? 50);
  return getJson<Paginated<UnipileChat>>("/chats", params);
}

export function listChatMessages(
  chatId: string,
  opts?: { cursor?: string; limit?: number },
): Promise<Paginated<UnipileChatMessage>> {
  const params: Record<string, string> = {
    limit: String(opts?.limit ?? 50),
  };
  if (opts?.cursor) params.cursor = opts.cursor;
  return getJson<Paginated<UnipileChatMessage>>(
    `/chats/${encodeURIComponent(chatId)}/messages`,
    params,
  );
}

export function listChatAttendees(
  chatId: string,
): Promise<Paginated<UnipileChatAttendee>> {
  return getJson<Paginated<UnipileChatAttendee>>(
    `/chats/${encodeURIComponent(chatId)}/attendees`,
  );
}

// ============================================================
// Send — chat message, new chat, invitation, InMail, email
// ============================================================

export interface SendResult {
  object?: string;
  message_id?: string | null;
  chat_id?: string | null;
  invitation_id?: string;
  tracking_id?: string;
  provider_id?: string | null;
}

/** Send a message inside an existing chat (LinkedIn DM / WhatsApp). */
export function sendChatMessage(input: {
  chatId: string;
  accountId: string;
  text: string;
}): Promise<SendResult> {
  return postForm<SendResult>(
    `/chats/${encodeURIComponent(input.chatId)}/messages`,
    { text: input.text, account_id: input.accountId },
  );
}

/**
 * Start a brand-new chat with a LinkedIn member (used for first-touch
 * DMs to 1st-degree connections and for InMail when `inmail: true`).
 * `attendeeProviderId` is the LinkedIn member provider id.
 */
export function startNewChat(input: {
  accountId: string;
  attendeeProviderId: string;
  text: string;
  inmail?: boolean;
}): Promise<SendResult> {
  const fields: Record<string, string> = {
    account_id: input.accountId,
    attendees_ids: input.attendeeProviderId,
    text: input.text,
  };
  if (input.inmail) {
    // LinkedIn-specific options ride in a JSON-encoded form field.
    fields.linkedin = JSON.stringify({ api: "classic", inmail: true });
  }
  return postForm<SendResult>("/chats", fields);
}

/** Send a LinkedIn connection invitation (≤300 char note). */
export function sendLinkedInInvitation(input: {
  accountId: string;
  providerId: string;
  message?: string;
  userEmail?: string;
}): Promise<SendResult> {
  const body: Record<string, unknown> = {
    provider_id: input.providerId,
    account_id: input.accountId,
  };
  if (input.message) body.message = input.message.slice(0, 300);
  if (input.userEmail) body.user_email = input.userEmail;
  return postJson<SendResult>("/users/invite", body);
}

/** Send an email through a connected mailbox (GOOGLE/OUTLOOK/IMAP). */
export function sendEmail(input: {
  accountId: string;
  to: string;
  subject?: string;
  body: string;
  replyTo?: string;
}): Promise<SendResult> {
  const fields: Record<string, string> = {
    account_id: input.accountId,
    to: JSON.stringify([{ identifier: input.to }]),
    body: input.body,
  };
  if (input.subject) fields.subject = input.subject;
  if (input.replyTo) fields.reply_to = input.replyTo;
  return postForm<SendResult>("/emails", fields);
}

// ============================================================
// Relations — branch condition "connected_on_linkedin"
// ============================================================

/**
 * Thin (sections-less) LinkedIn user fetch — resolves the member's
 * provider_id (needed by startNewChat / invitations) and network
 * distance, without the heavy full-profile budget.
 */
export async function getLinkedInUser(input: {
  accountId: string;
  identifier: string; // public id or provider id
}): Promise<{ providerId: string | null; networkDistance: string | null }> {
  try {
    const res = await getJson<{ provider_id?: string; network_distance?: string }>(
      `/users/${encodeURIComponent(input.identifier)}`,
      { account_id: input.accountId },
    );
    return {
      providerId: res.provider_id ?? null,
      networkDistance: res.network_distance ?? null,
    };
  } catch (e) {
    console.warn("[unipile messaging] getLinkedInUser failed:", e);
    return { providerId: null, networkDistance: null };
  }
}

/**
 * Fetch the network distance between the connected account and a
 * LinkedIn member. Returns "FIRST" | "SECOND" | "THIRD" | ... or null
 * when unknown.
 */
export async function getNetworkDistance(input: {
  accountId: string;
  identifier: string; // public id or provider id
}): Promise<string | null> {
  return (await getLinkedInUser(input)).networkDistance;
}

// ============================================================
// Webhook management
// ============================================================

/**
 * Register the messaging webhook for this tenant. Idempotency is on
 * the caller (Unipile happily creates duplicates) — list first via
 * GET /webhooks when wiring this up.
 */
export function createMessagingWebhook(input: {
  requestUrl: string;
  secret: string;
  name?: string;
}): Promise<{ object?: string; webhook_id?: string }> {
  return postJson("/webhooks", {
    source: "messaging",
    request_url: input.requestUrl,
    name: input.name ?? "ats-conversations",
    format: "json",
    headers: [{ key: "X-Webhook-Secret", value: input.secret }],
  });
}

/**
 * Register the EMAIL-source webhook (Gmail/Outlook/IMAP). Separate from
 * the messaging webhook — Unipile fires `email`-source events for
 * mailboxes and `messaging`-source for chats. Both can point at the
 * same request_url; our receiver branches by payload shape.
 */
export function createEmailWebhook(input: {
  requestUrl: string;
  secret: string;
  name?: string;
}): Promise<{ object?: string; webhook_id?: string }> {
  return postJson("/webhooks", {
    source: "email",
    request_url: input.requestUrl,
    name: input.name ?? "ats-conversations-email",
    format: "json",
    headers: [{ key: "X-Webhook-Secret", value: input.secret }],
  });
}

export function listWebhooks(): Promise<Paginated<{ id: string; request_url?: string; source?: string }>> {
  return getJson("/webhooks");
}
