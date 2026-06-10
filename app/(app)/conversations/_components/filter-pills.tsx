"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Channel + state filter pills for the inbox. URL-driven so the
 * server page re-queries; mirrors Leonar's status-pill toolbar.
 */
export function FilterPills({
  channel,
  f,
}: {
  channel: string | null;
  f: string | null;
}) {
  const pathname = usePathname();

  function href(next: { channel?: string | null; f?: string | null }): string {
    const params = new URLSearchParams();
    const ch = next.channel === undefined ? channel : next.channel;
    const ff = next.f === undefined ? f : next.f;
    if (ch) params.set("channel", ch);
    if (ff) params.set("f", ff);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const channels: Array<{ key: string | null; label: string }> = [
    { key: null, label: "All channels" },
    { key: "linkedin", label: "LinkedIn" },
    { key: "email", label: "Email" },
    { key: "whatsapp", label: "WhatsApp" },
  ];
  const states: Array<{ key: string | null; label: string }> = [
    { key: null, label: "All" },
    { key: "unread", label: "Unread" },
    { key: "drafts", label: "Drafts" },
    { key: "unlinked", label: "Unlinked" },
  ];

  const pill = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border bg-card text-muted-foreground hover:bg-muted"
    }`;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {channels.map((c) => (
        <Link key={c.label} href={href({ channel: c.key })} className={pill(channel === c.key)}>
          {c.label}
        </Link>
      ))}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      {states.map((s) => (
        <Link key={s.label} href={href({ f: s.key })} className={pill(f === s.key)}>
          {s.label}
        </Link>
      ))}
    </div>
  );
}
