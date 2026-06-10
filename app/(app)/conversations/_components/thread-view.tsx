"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Link as LinkIcon,
  Loader2,
  PenLine,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  approveDraftAction,
  discardDraftAction,
  linkConversationAction,
  markConversationReadAction,
  searchCandidatesForLinkAction,
  sendConversationMessageAction,
} from "../../_actions/conversations";
import type { ConversationListItem } from "./conversation-list";

export type ThreadMessage = {
  id: string;
  direction: string;
  body: string | null;
  subject: string | null;
  sentAt: string | null;
  status: string;
  sendError: string | null;
};

export function ThreadView({
  conversation,
  messages,
}: {
  conversation: ConversationListItem;
  messages: ThreadMessage[];
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  // Opening the thread clears the unread badge (fire-and-forget).
  useEffect(() => {
    if (conversation.unreadCount > 0) {
      void markConversationReadAction({ conversationId: conversation.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const sent = messages.filter((m) => m.status !== "draft");
  const drafts = messages.filter((m) => m.status === "draft");
  const name = conversation.candidateName ?? conversation.attendeeName ?? "(unknown)";

  return (
    <div className="flex h-[calc(100vh-260px)] flex-col rounded-md border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {conversation.channel}
            {conversation.subject ? ` · ${conversation.subject}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {conversation.candidateId ? (
            <Link
              href={`/candidates?candidate=${conversation.candidateId}&tab=conversations`}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              Open candidate
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setLinkOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              <LinkIcon className="h-3 w-3" />
              Link to candidate
            </button>
          )}
        </div>
      </div>

      {linkOpen && !conversation.candidateId ? (
        <LinkCandidateBox
          conversationId={conversation.id}
          onDone={() => setLinkOpen(false)}
        />
      ) : null}

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {sent.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages in this conversation yet.
          </p>
        ) : (
          sent.map((m) => <Bubble key={m.id} message={m} />)
        )}
        {drafts.map((d) => (
          <DraftCard key={d.id} draft={d} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <Composer conversationId={conversation.id} channel={conversation.channel} />
    </div>
  );
}

function Bubble({ message }: { message: ThreadMessage }) {
  const outbound = message.direction === "outbound";
  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          outbound
            ? "bg-foreground text-background"
            : "border border-border bg-background"
        }`}
      >
        {message.subject ? (
          <p className={`mb-1 text-xs font-semibold ${outbound ? "text-background/80" : "text-muted-foreground"}`}>
            {message.subject}
          </p>
        ) : null}
        {message.body ?? <span className="italic opacity-60">(no text)</span>}
        <p
          className={`mt-1 text-[10px] ${
            outbound ? "text-background/60" : "text-muted-foreground"
          }`}
        >
          {message.sentAt
            ? new Date(message.sentAt).toLocaleString("es-MX", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
          {message.status === "failed" ? (
            <span className="ml-1 inline-flex items-center gap-0.5 text-destructive">
              <AlertTriangle className="h-2.5 w-2.5" />
              failed{message.sendError ? `: ${message.sendError}` : ""}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/** Agent-authored draft awaiting human approval. */
function DraftCard({ draft }: { draft: ThreadMessage }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.body ?? "");
  const [pending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const res = await approveDraftAction({
        messageId: draft.id,
        editedText: editing ? text : undefined,
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't send draft", res.error);
        return;
      }
      toast.actionOk("Draft sent");
    });
  }

  function discard() {
    startTransition(async () => {
      const res = await discardDraftAction({ messageId: draft.id });
      if (!res.ok) {
        toast.actionFailed("Couldn't discard draft", res.error);
        return;
      }
      toast.actionOk("Draft discarded");
    });
  }

  return (
    <div className="rounded-md border border-warning/40 bg-warning/[0.06] p-3">
      <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-warning">
        <PenLine className="h-3 w-3" />
        Agent draft — review before sending
      </p>
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm">{draft.body}</p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={pending || (editing && !text.trim())}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Approve & send
        </button>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
        >
          {editing ? <X className="h-3 w-3" /> : <PenLine className="h-3 w-3" />}
          {editing ? "Cancel edit" : "Edit"}
        </button>
        <button
          type="button"
          onClick={discard}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3 w-3" />
          Discard
        </button>
      </div>
    </div>
  );
}

function Composer({
  conversationId,
  channel,
}: {
  conversationId: string;
  channel: string;
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const sendable = channel === "linkedin" || channel === "whatsapp";

  function send() {
    const value = text.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await sendConversationMessageAction({
        conversationId,
        text: value,
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't send message", res.error);
        return;
      }
      setText("");
    });
  }

  if (!sendable) {
    return (
      <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        Replying on this channel from the ATS isn&apos;t wired up yet — answer from your mail client.
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 border-t border-border px-3 py-2.5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
        }}
        placeholder="Write a message… (⌘↵ to send)"
        rows={2}
        className="flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={send}
        disabled={!text.trim() || pending}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        Send
      </button>
    </div>
  );
}

function LinkCandidateBox({
  conversationId,
  onDone,
}: {
  conversationId: string;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; name: string; headline: string | null }>
  >([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      void searchCandidatesForLinkAction({ query }).then((res) => {
        if (res.ok) setResults(res.data.items);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function link(candidateId: string) {
    startTransition(async () => {
      const res = await linkConversationAction({ conversationId, candidateId });
      if (!res.ok) {
        toast.actionFailed("Couldn't link conversation", res.error);
        return;
      }
      toast.actionOk("Conversation linked");
      onDone();
    });
  }

  return (
    <div className="border-b border-border bg-background px-4 py-2.5">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search candidate by name…"
        autoFocus
        className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm"
      />
      {results.length > 0 ? (
        <ul className="mt-1.5 divide-y divide-border rounded-md border border-border">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => link(r.id)}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                <span className="truncate">{r.name}</span>
                {r.headline ? (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {r.headline}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
