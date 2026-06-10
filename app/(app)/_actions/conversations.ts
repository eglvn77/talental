"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { requireCurrentTeamMember } from "@/lib/auth/team";
import {
  sendChatMessage,
  UnipileMessagingError,
} from "@/lib/integrations/unipile/messaging";
import { type ActionResult } from "./_shared";

/**
 * Server actions for the Conversations module (Unipile-backed inbox).
 *
 * Sending is ALWAYS a human action from the UI — agents only create
 * `status='draft'` rows (via service role elsewhere); the recruiter
 * approves/edits/discards them here.
 */

type ConversationRow = {
  id: string;
  workspace_id: string;
  channel: string;
  external_id: string | null;
  candidate_id: string | null;
};

async function loadConversationGuarded(
  conversationId: string,
): Promise<
  | { ok: true; db: Awaited<ReturnType<typeof hiring>>; conv: ConversationRow }
  | { ok: false; error: string }
> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const { data: conv } = await db
    .from("conversations")
    .select("id, workspace_id, channel, external_id, candidate_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: "Conversation not found" };
  if ((conv as ConversationRow).workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace conversation" };
  }
  return { ok: true, db, conv: conv as ConversationRow };
}

/**
 * Resolve which connected account can send on a channel. Today: the
 * workspace's first healthy account of the matching provider family.
 */
async function resolveSenderAccount(
  db: Awaited<ReturnType<typeof hiring>>,
  workspaceId: string,
  channel: string,
): Promise<string | null> {
  const providers =
    channel === "linkedin"
      ? ["LINKEDIN"]
      : channel === "whatsapp"
        ? ["WHATSAPP"]
        : channel === "email"
          ? ["GOOGLE", "OUTLOOK", "IMAP"]
          : [];
  if (providers.length === 0) return null;
  const { data } = await db
    .from("connected_accounts")
    .select("unipile_account_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "OK")
    .in("provider", providers)
    .limit(1);
  return (data?.[0]?.unipile_account_id as string | undefined) ?? null;
}

async function deliverViaUnipile(
  db: Awaited<ReturnType<typeof hiring>>,
  conv: ConversationRow,
  messageRowId: string,
  text: string,
): Promise<ActionResult> {
  const accountId = await resolveSenderAccount(db, conv.workspace_id, conv.channel);
  if (!accountId) {
    await db
      .from("messages")
      .update({ status: "failed", send_error: "No connected account for channel" })
      .eq("id", messageRowId);
    return { ok: false, error: `No connected ${conv.channel} account in Unipile` };
  }
  if (!conv.external_id) {
    await db
      .from("messages")
      .update({ status: "failed", send_error: "Conversation has no provider chat id" })
      .eq("id", messageRowId);
    return { ok: false, error: "Conversation has no provider chat id" };
  }
  try {
    const sent = await sendChatMessage({
      chatId: conv.external_id,
      accountId,
      text,
    });
    // Storing Unipile's message_id makes the later webhook echo of our
    // own message dedup cleanly. When Unipile returns null we accept a
    // possible duplicate row (cosmetic, not functional).
    await db
      .from("messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        external_id: sent.message_id ?? null,
        send_error: null,
      })
      .eq("id", messageRowId);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof UnipileMessagingError
        ? `Unipile ${e.status}: ${e.message}`
        : e instanceof Error
          ? e.message
          : String(e);
    await db
      .from("messages")
      .update({ status: "failed", send_error: message })
      .eq("id", messageRowId);
    return { ok: false, error: message };
  }
}

/** Compose + send a new outbound message in an existing conversation. */
export async function sendConversationMessageAction(input: {
  conversationId: string;
  text: string;
}): Promise<ActionResult> {
  const loaded = await loadConversationGuarded(input.conversationId);
  if (!loaded.ok) return loaded;
  const { db, conv } = loaded;
  const text = input.text.trim();
  if (!text) return { ok: false, error: "Empty message" };

  const { data: row, error } = await db
    .from("messages")
    .insert({
      workspace_id: conv.workspace_id,
      conversation_id: conv.id,
      channel: conv.channel,
      direction: "outbound",
      body: text,
      status: "queued",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !row) {
    return { ok: false, error: error?.message ?? "Couldn't store message" };
  }
  const res = await deliverViaUnipile(db, conv, row.id as string, text);
  revalidatePath("/conversations");
  return res;
}

/** Approve (optionally after editing) an agent-created draft and send it. */
export async function approveDraftAction(input: {
  messageId: string;
  editedText?: string;
}): Promise<ActionResult> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: msg } = await db
    .from("messages")
    .select("id, workspace_id, conversation_id, body, status")
    .eq("id", input.messageId)
    .maybeSingle();
  if (!msg || (msg as { workspace_id: string }).workspace_id !== workspaceId) {
    return { ok: false, error: "Draft not found" };
  }
  if ((msg as { status: string }).status !== "draft") {
    return { ok: false, error: "Message is not a draft" };
  }
  const text = (input.editedText ?? (msg as { body: string | null }).body ?? "").trim();
  if (!text) return { ok: false, error: "Empty draft" };

  const loaded = await loadConversationGuarded(
    (msg as { conversation_id: string }).conversation_id,
  );
  if (!loaded.ok) return loaded;

  await db
    .from("messages")
    .update({ body: text, status: "queued" })
    .eq("id", input.messageId);
  const res = await deliverViaUnipile(loaded.db, loaded.conv, input.messageId, text);
  revalidatePath("/conversations");
  return res;
}

/** Throw away an agent draft. */
export async function discardDraftAction(input: {
  messageId: string;
}): Promise<ActionResult> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const { error } = await db
    .from("messages")
    .delete()
    .eq("id", input.messageId)
    .eq("workspace_id", workspaceId)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/conversations");
  return { ok: true };
}

/** Manually link a conversation to a candidate. */
export async function linkConversationAction(input: {
  conversationId: string;
  candidateId: string | null;
}): Promise<ActionResult> {
  const loaded = await loadConversationGuarded(input.conversationId);
  if (!loaded.ok) return loaded;
  const { db, conv } = loaded;
  if (input.candidateId) {
    const { data: cand } = await db
      .from("candidates")
      .select("id, workspace_id")
      .eq("id", input.candidateId)
      .maybeSingle();
    if (!cand || (cand as { workspace_id: string }).workspace_id !== conv.workspace_id) {
      return { ok: false, error: "Candidate not found" };
    }
  }
  const { error } = await db
    .from("conversations")
    .update({ candidate_id: input.candidateId })
    .eq("id", conv.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/conversations");
  return { ok: true };
}

/** Clear the unread badge when the thread is opened. */
export async function markConversationReadAction(input: {
  conversationId: string;
}): Promise<ActionResult> {
  const loaded = await loadConversationGuarded(input.conversationId);
  if (!loaded.ok) return loaded;
  const { db, conv } = loaded;
  await db.from("conversations").update({ unread_count: 0 }).eq("id", conv.id);
  return { ok: true };
}

/** Typeahead for the link-conversation dialog. */
export async function searchCandidatesForLinkAction(input: {
  query: string;
}): Promise<ActionResult<{ items: Array<{ id: string; name: string; headline: string | null }> }>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const q = input.query.trim();
  if (q.length < 2) return { ok: true, data: { items: [] } };
  const { data } = await db
    .from("candidates")
    .select("id, full_name, headline")
    .eq("workspace_id", workspaceId)
    .ilike("full_name", `%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(8);
  return {
    ok: true,
    data: {
      items: (data ?? []).map((c) => ({
        id: c.id as string,
        name: (c.full_name as string) ?? "(unnamed)",
        headline: (c.headline as string | null) ?? null,
      })),
    },
  };
}

export type CandidateConversationBundle = {
  id: string;
  channel: string;
  subject: string | null;
  attendee_name: string | null;
  last_message_at: string | null;
  messages: Array<{
    id: string;
    direction: string;
    body: string | null;
    subject: string | null;
    sent_at: string | null;
    status: string;
  }>;
};

/** Conversations + messages for the candidate profile tab. */
export async function loadCandidateConversationsAction(input: {
  candidateId: string;
}): Promise<ActionResult<{ items: CandidateConversationBundle[] }>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const { data: convs } = await db
    .from("conversations")
    .select("id, channel, subject, attendee_name, last_message_at")
    .eq("workspace_id", workspaceId)
    .eq("candidate_id", input.candidateId)
    .order("last_message_at", { ascending: false })
    .limit(10);
  const items: CandidateConversationBundle[] = [];
  for (const conv of convs ?? []) {
    const { data: msgs } = await db
      .from("messages")
      .select("id, direction, body, subject, sent_at, status")
      .eq("conversation_id", conv.id as string)
      .order("sent_at", { ascending: true })
      .limit(50);
    items.push({
      id: conv.id as string,
      channel: conv.channel as string,
      subject: (conv.subject as string | null) ?? null,
      attendee_name: (conv.attendee_name as string | null) ?? null,
      last_message_at: (conv.last_message_at as string | null) ?? null,
      messages: (msgs ?? []).map((m) => ({
        id: m.id as string,
        direction: m.direction as string,
        body: (m.body as string | null) ?? null,
        subject: (m.subject as string | null) ?? null,
        sent_at: (m.sent_at as string | null) ?? null,
        status: m.status as string,
      })),
    });
  }
  return { ok: true, data: { items } };
}
