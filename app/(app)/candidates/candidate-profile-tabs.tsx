"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/**
 * Card-level tab strip inside the candidate profile body — sits
 * below the Applications card. Two real panes:
 *
 *   - Perfil del CV  — parsed-profile section (experience,
 *                      education, tenure summary, skills).
 *   - Notas          — NotesSection wired to entity_type='candidate'.
 *
 * Note: the TOP-LEVEL "Conversations" tab (accessible via the
 * header tab strip + ?tab=conversations URL param) is the home for
 * transcripts + future Unipile messaging. This card-level Conversa-
 * tions tab was removed to avoid duplication — recruiters use the
 * top-level tab for that workflow.
 */
type TabId = "profile" | "notes";

export function CandidateProfileTabs({
  profileSlot,
  notesSlot,
  defaultTab = "profile",
}: {
  profileSlot: ReactNode;
  notesSlot: ReactNode;
  defaultTab?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(defaultTab);
  const t = useT();

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={t("candidatesArea.tabsAriaLabel")}
        className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs"
      >
        <TabBtn value="profile" current={tab} onClick={setTab} label={t("candidatesArea.tabCvProfile")} />
        <TabBtn value="notes" current={tab} onClick={setTab} label={t("candidatesArea.tabNotes")} />
      </div>

      <div>
        {tab === "profile" ? profileSlot : null}
        {tab === "notes" ? notesSlot : null}
      </div>
    </div>
  );
}

function TabBtn({
  value,
  current,
  onClick,
  label,
}: {
  value: TabId;
  current: TabId;
  onClick: (t: TabId) => void;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors",
        active
          ? "bg-foreground/[0.07] font-medium text-foreground"
          : "text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
