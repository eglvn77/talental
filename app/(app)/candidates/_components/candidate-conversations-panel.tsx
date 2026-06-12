"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Linkedin,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  PenLine,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  approveDraftAction,
  discardDraftAction,
  loadCandidateConversationsAction,
  sendConversationMessageAction,
  type CandidateConversationBundle,
} from "../../_actions/conversations";

/**
 * Interactive conversations panel embedded in the candidate profile's
 * right column (next to Experience). Lets the recruiter read AND reply
 * to LinkedIn / WhatsApp / email threads without leaving the profile —
 * the same send path the standalone inbox uses
 * (sendConversationMessageAction).
 *
 * Rendering is a proper two-sided chat: our outbound messages align
 * right with a colored bubble, the candidate's inbound messages align
 * left with a neutral bubble, each labelled with sender + time.
 */
export function CandidateConversationsPanel({
  candidateId,
}: {
  candidateId: string;
}) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "error"; error: string }
    | { phase: "ready"; items: CandidateConversationBundle[] }
  >({ phase: "loading" });
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(
    async (opts?: { keepActive?: boolean }) => {
      const res = await loadCandidateConversationsAction({ candidateId });
      if (!res.ok) {
        setState({ phase: "error", error: res.error });
        return;
      }
      setState({ phase: "ready", items: res.data.items });
      setActiveId((cur) => {
        if (opts?.keepActive && cur && res.data.items.some((c) => c.id === cur)) {
          return cur;
        }
        return res.data.items[0]?.id ?? null;
      });
    },
    [candidateId],
  );

  useEffect(() => {
    let cancelled = false;
    void loadCandidateConversationsAction({ candidateId }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setState({ phase: "error", error: res.error });
        return;
      }
      setState({ phase: "ready", items: res.data.items });
      setActiveId(res.data.items[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  if (state.phase === "loading") {
    return (
      <PanelShell>
        <p className="inline-flex items-center gap-1.5 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading conversations…
        </p>
      </PanelShell>
    );
  }
  if (state.phase === "error") {
    return (
      <PanelShell>
        <p className="px-4 py-8 text-sm text-destructive">{state.error}</p>
      </PanelShell>
    );
  }
  if (state.items.length === 0) {
    return (
      <PanelShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No LinkedIn, WhatsApp or email conversations linked to this
            candidate yet.
          </p>
          <Link
            href="/conversations"
            className="text-xs text-foreground underline underline-offset-2"
          >
            Open the inbox
          </Link>
        </div>
      </PanelShell>
    );
  }

  const active =
    state.items.find((c) => c.id === activeId) ?? state.items[0];

  return (
    <PanelShell>
      {/* Channel / thread switcher — only when more than one thread. */}
      {state.items.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
          {state.items.map((c) => (
            <ThreadPill
              key={c.id}
              conv={c}
              active={c.id === active.id}
              onClick={() => setActiveId(c.id)}
            />
          ))}
        </div>
      ) : null}

      <ActiveThread
        key={active.id}
        conv={active}
        onChanged={() => refresh({ keepActive: true })}
      />
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[640px] max-h-[78vh] flex-col overflow-hidden rounded-md border border-border bg-card">
      {children}
    </div>
  );
}

function channelIcon(channel: string) {
  if (channel === "linkedin") return Linkedin;
  if (channel === "email") return Mail;
  return MessageCircle;
}

function ThreadPill({
  conv,
  active,
  onClick,
}: {
  conv: CandidateConversationBundle;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = channelIcon(conv.channel);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-[180px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-foreground/20 bg-foreground/[0.07] font-medium text-foreground"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate capitalize">
        {conv.subject || conv.channel}
      </span>
    </button>
  );
}

function ActiveThread({
  conv,
  onChanged,
}: {
  conv: CandidateConversationBundle;
  onChanged: () => void | Promise<void>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const Icon = channelIcon(conv.channel);

  const sent = conv.messages.filter((m) => m.status !== "draft");
  const drafts = conv.messages.filter((m) => m.status === "draft");
  const counterpart = conv.attendee_name ?? "Candidate";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conv.messages.length]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {conv.channel}
        </span>
        {conv.subject ? (
          <span className="truncate text-xs text-muted-foreground">
            · {conv.subject}
          </span>
        ) : null}
        <Link
          href={`/conversations?c=${conv.id}`}
          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Open in inbox
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {sent.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet.
          </p>
        ) : (
          sent.map((m) => (
            <Bubble key={m.id} message={m} counterpart={counterpart} />
          ))
        )}
        {drafts.map((d) => (
          <DraftCard key={d.id} draft={d} onChanged={onChanged} />
        ))}
        <div ref={bottomRef} />
      </div>

      <Composer
        conversationId={conv.id}
        channel={conv.channel}
        onSent={onChanged}
      />
    </>
  );
}

function Bubble({
  message,
  counterpart,
}: {
  message: CandidateConversationBundle["messages"][number];
  counterpart: string;
}) {
  const outbound = message.direction === "outbound";
  return (
    <div className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}>
      <span className="mb-0.5 px-1 text-[10px] font-medium text-muted-foreground">
        {outbound ? "You" : counterpart}
      </span>
      <div
        className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
          outbound
            ? "rounded-br-sm bg-accent text-fg-on-accent"
            : "rounded-bl-sm border border-border bg-background"
        }`}
      >
        {message.subject ? (
          <p
            className={`mb-1 text-xs font-semibold ${
              outbound ? "text-fg-on-accent/80" : "text-muted-foreground"
            }`}
          >
            {message.subject}
          </p>
        ) : null}
        {message.body ?? <span className="italic opacity-60">(no text)</span>}
      </div>
      <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
        {message.sent_at
          ? new Date(message.sent_at).toLocaleString("es-MX", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : ""}
        {message.status === "queued" ? " · sending…" : ""}
        {message.status === "failed" ? (
          <span className="ml-1 inline-flex items-center gap-0.5 text-destructive">
            <AlertTriangle className="h-2.5 w-2.5" />
            failed
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Agent-authored draft awaiting human approval. */
function DraftCard({
  draft,
  onChanged,
}: {
  draft: CandidateConversationBundle["messages"][number];
  onChanged: () => void | Promise<void>;
}) {
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
      await onChanged();
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
      await onChanged();
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
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={pending || (editing && !text.trim())}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Approve &amp; send
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
  onSent,
}: {
  conversationId: string;
  channel: string;
  onSent: () => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const sendable =
    channel === "linkedin" || channel === "whatsapp" || channel === "email";

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
      await onSent();
    });
  }

  if (!sendable) {
    return (
      <div className="border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
        Replying on this channel from the ATS isn&apos;t wired up yet.
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 border-t border-border px-3 py-2.5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Write a message… (⌘↵ to send)"
        rows={2}
        className="flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={send}
        disabled={!text.trim() || pending}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Send className="h-3 w-3" />
        )}
        Send
      </button>
    </div>
  );
}
