"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Linkedin, Mail, MessageCircle, PenLine } from "lucide-react";

export type ConversationListItem = {
  id: string;
  channel: string;
  subject: string | null;
  attendeeName: string | null;
  candidateId: string | null;
  candidateName: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  hasDraft: boolean;
};

function ChannelIcon({ channel }: { channel: string }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  if (channel === "linkedin") return <Linkedin className={cls} />;
  if (channel === "email") return <Mail className={cls} />;
  return <MessageCircle className={cls} />;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("es-MX", { month: "short", day: "numeric" });
}

export function ConversationList({
  items,
  selectedId,
}: {
  items: ConversationListItem[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function select(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("c", id);
    router.replace(`/conversations?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="max-h-[calc(100vh-260px)] overflow-y-auto rounded-md border border-border bg-card">
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const name = item.candidateName ?? item.attendeeName ?? "(unknown)";
          const active = item.id === selectedId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => select(item.id)}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <ChannelIcon channel={item.channel} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p
                      className={`truncate text-sm ${
                        item.unreadCount > 0 ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {name}
                    </p>
                    {item.hasDraft ? (
                      <PenLine className="h-3 w-3 shrink-0 text-warning" aria-label="Has draft" />
                    ) : null}
                    {!item.candidateId ? (
                      <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        unlinked
                      </span>
                    ) : null}
                  </div>
                  {item.subject ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.subject}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-muted-foreground">
                    {relativeTime(item.lastMessageAt)}
                  </span>
                  {item.unreadCount > 0 ? (
                    <span className="rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
                      {item.unreadCount}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
