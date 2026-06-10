"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Linkedin, Loader2, Mail, MessageCircle, MessageSquare } from "lucide-react";
import {
  loadCandidateConversationsAction,
  type CandidateConversationBundle,
} from "../../_actions/conversations";

/**
 * Candidate-profile flavor of the conversations module: every chat
 * linked to this candidate, latest messages inline, link out to the
 * full inbox for replying. Client-fetched via server action so the
 * candidate bundle loaders didn't need surgery.
 */
export function CandidateMessagesSection({ candidateId }: { candidateId: string }) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "error"; error: string }
    | { phase: "ready"; items: CandidateConversationBundle[] }
  >({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadCandidateConversationsAction({ candidateId }).then((res) => {
      if (cancelled) return;
      if (!res.ok) setState({ phase: "error", error: res.error });
      else setState({ phase: "ready", items: res.data.items });
    });
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Messages
        </h3>
        <Link
          href="/conversations"
          className="rounded-md px-2 py-0.5 text-xs text-foreground hover:bg-muted"
        >
          Open inbox
        </Link>
      </div>

      {state.phase === "loading" ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading conversations…
        </p>
      ) : state.phase === "error" ? (
        <p className="mt-3 text-sm text-destructive">{state.error}</p>
      ) : state.items.length === 0 ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          No LinkedIn / email conversations linked to this candidate yet.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {state.items.map((conv) => (
            <ConversationBlock key={conv.id} conv={conv} />
          ))}
        </div>
      )}
    </section>
  );
}

function ConversationBlock({ conv }: { conv: CandidateConversationBundle }) {
  const Icon =
    conv.channel === "linkedin" ? Linkedin : conv.channel === "email" ? Mail : MessageCircle;
  // Latest 6 messages inline; full thread lives in the inbox.
  const recent = conv.messages.slice(-6);
  return (
    <div className="rounded-md border border-border bg-background">
      <Link
        href={`/conversations?c=${conv.id}`}
        className="flex items-center gap-2 border-b border-border px-3 py-2 hover:bg-muted"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {conv.channel}
        </span>
        {conv.subject ? (
          <span className="truncate text-xs text-muted-foreground">· {conv.subject}</span>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {conv.last_message_at
            ? new Date(conv.last_message_at).toLocaleDateString("es-MX", {
                month: "short",
                day: "numeric",
              })
            : ""}
        </span>
      </Link>
      <div className="space-y-1.5 px-3 py-2">
        {recent.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
          >
            <p
              className={`max-w-[85%] whitespace-pre-wrap break-words rounded-md px-2 py-1 text-xs ${
                m.status === "draft"
                  ? "border border-warning/40 bg-warning/[0.06]"
                  : m.direction === "outbound"
                    ? "bg-foreground text-background"
                    : "border border-border bg-card"
              }`}
            >
              {m.status === "draft" ? <span className="mr-1 font-semibold">[draft]</span> : null}
              {m.body ?? "(no text)"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
