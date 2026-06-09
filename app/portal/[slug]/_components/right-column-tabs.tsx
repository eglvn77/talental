"use client";

import { useState, type ReactNode } from "react";
import { Sparkles, MessageSquare } from "lucide-react";

/**
 * Two-tab right column on the public application share page.
 *
 * Tab 1 — Reporte: the AI-generated interview report (already
 *   resolved to HTML by the server before being passed in).
 * Tab 2 — Feedback: the anonymous comment form + existing
 *   comments thread (both passed in as server-rendered slots so
 *   we avoid fetching from the client + keep the page entirely
 *   token-gated server-side).
 *
 * Server slots are kept hidden via CSS rather than conditionally
 * mounted so the comments stay rendered (and indexable) even when
 * the recruiter expects clients to read the report first. Tab
 * state is purely visual.
 */
type TabId = "report" | "feedback";

export function RightColumnTabs({
  reportSlot,
  feedbackSlot,
  feedbackCount,
}: {
  reportSlot: ReactNode;
  feedbackSlot: ReactNode;
  feedbackCount: number;
}) {
  const [tab, setTab] = useState<TabId>("report");

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div
        role="tablist"
        aria-label="Sections"
        className="mb-4 inline-flex rounded-md border border-border bg-background p-0.5 text-xs"
      >
        <TabBtn
          value="report"
          current={tab}
          onClick={setTab}
          icon={<Sparkles className="h-3 w-3" />}
          label="Report"
        />
        <TabBtn
          value="feedback"
          current={tab}
          onClick={setTab}
          icon={<MessageSquare className="h-3 w-3" />}
          label={
            feedbackCount > 0 ? `Feedback (${feedbackCount})` : "Feedback"
          }
        />
      </div>

      <div className={tab === "report" ? undefined : "hidden"}>
        {reportSlot}
      </div>
      <div className={tab === "feedback" ? undefined : "hidden"}>
        {feedbackSlot}
      </div>
    </div>
  );
}

function TabBtn({
  value,
  current,
  onClick,
  label,
  icon,
}: {
  value: TabId;
  current: TabId;
  onClick: (t: TabId) => void;
  label: string;
  icon?: ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(value)}
      className={
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors " +
        (active
          ? "bg-foreground/[0.07] font-medium text-foreground"
          : "text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
}
