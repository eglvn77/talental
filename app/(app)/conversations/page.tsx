import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { PageContainer, PageHeader } from "../_components/page-shell";
import { PortalRealtime } from "@/app/portal/[slug]/_components/portal-realtime";
import { EmptyState } from "../_components/empty-state";
import { ConversationList, type ConversationListItem } from "./_components/conversation-list";
import { ThreadView, type ThreadMessage } from "./_components/thread-view";
import { FilterPills } from "./_components/filter-pills";

export const dynamic = "force-dynamic";

/**
 * Unipile-backed inbox: every LinkedIn/email/WhatsApp conversation the
 * monitor ingests, split-view (list | thread + composer). Deep-linkable
 * via ?c=<conversation id>; ?channel= and ?f= filter the list.
 */
export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; channel?: string; f?: string }>;
}) {
  const sp = await searchParams;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  let query = db
    .from("conversations")
    .select(
      "id, channel, subject, attendee_name, attendee_identifier, candidate_id, last_message_at, unread_count, candidate:candidates(full_name)",
    )
    .eq("workspace_id", workspaceId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(150);
  if (sp.channel) query = query.eq("channel", sp.channel);
  if (sp.f === "unlinked") query = query.is("candidate_id", null);
  if (sp.f === "unread") query = query.gt("unread_count", 0);
  const { data: convRows } = await query;

  // Which of the listed conversations carry an agent draft? One query,
  // mapped client-side — keeps the badge cheap.
  const convIds = (convRows ?? []).map((c) => c.id as string);
  const draftSet = new Set<string>();
  if (convIds.length > 0) {
    const { data: draftRows } = await db
      .from("messages")
      .select("conversation_id")
      .eq("status", "draft")
      .in("conversation_id", convIds);
    for (const d of draftRows ?? []) draftSet.add(d.conversation_id as string);
  }

  let items: ConversationListItem[] = (convRows ?? []).map((c) => {
    const candidate = c.candidate as { full_name?: string } | { full_name?: string }[] | null;
    const candidateName = Array.isArray(candidate)
      ? candidate[0]?.full_name ?? null
      : candidate?.full_name ?? null;
    return {
      id: c.id as string,
      channel: c.channel as string,
      subject: (c.subject as string | null) ?? null,
      attendeeName: (c.attendee_name as string | null) ?? null,
      candidateId: (c.candidate_id as string | null) ?? null,
      candidateName,
      lastMessageAt: (c.last_message_at as string | null) ?? null,
      unreadCount: (c.unread_count as number | null) ?? 0,
      hasDraft: draftSet.has(c.id as string),
    };
  });
  if (sp.f === "drafts") items = items.filter((i) => i.hasDraft);

  // Selected thread
  const selectedId =
    sp.c && items.some((i) => i.id === sp.c) ? sp.c : items[0]?.id ?? null;
  const selected = items.find((i) => i.id === selectedId) ?? null;
  let messages: ThreadMessage[] = [];
  if (selectedId) {
    const { data: msgRows } = await db
      .from("messages")
      .select("id, direction, body, subject, sent_at, status, send_error, channel")
      .eq("conversation_id", selectedId)
      .order("sent_at", { ascending: true })
      .limit(200);
    messages = (msgRows ?? []).map((m) => ({
      id: m.id as string,
      direction: m.direction as string,
      body: (m.body as string | null) ?? null,
      subject: (m.subject as string | null) ?? null,
      sentAt: (m.sent_at as string | null) ?? null,
      status: m.status as string,
      sendError: (m.send_error as string | null) ?? null,
    }));
  }

  const draftsCount = items.filter((i) => i.hasDraft).length;

  return (
    <PageContainer className="max-w-[1400px]">
      <PortalRealtime intervalMs={12_000} />
      <PageHeader
        title="Conversations"
        meta={`${items.length} conversations${draftsCount > 0 ? ` · ${draftsCount} with drafts` : ""}`}
      />
      <FilterPills channel={sp.channel ?? null} f={sp.f ?? null} />
      {items.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Messages from your connected LinkedIn / email accounts land here automatically once the Unipile webhook is live (or after running the backfill)."
        />
      ) : (
        <div className="mt-4 grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4 lg:col-span-4">
            <ConversationList items={items} selectedId={selectedId} />
          </div>
          <div className="col-span-12 md:col-span-8 lg:col-span-8">
            {selected ? (
              <ThreadView
                key={selected.id}
                conversation={selected}
                messages={messages}
              />
            ) : null}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
