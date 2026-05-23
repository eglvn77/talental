"use client";

import { useState, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tab strip for the candidate profile (below the contact inspector +
 * applications card). Three panes:
 *
 *   - Perfil del CV        — the parsed-profile section (experience,
 *                            education, tenure summary, skills, etc.)
 *   - Notas                — reusable NotesSection wired to
 *                            entity_type='candidate'.
 *   - Conversaciones       — placeholder. Lands when the Unipile
 *                            integration ships (LinkedIn, WhatsApp,
 *                            email, IG, Telegram).
 *
 * The "Conversaciones" tab is enabled-clickable but the content is a
 * "Pronto" stub — keeps the affordance visible so users get the
 * mental model.
 */
type TabId = "profile" | "notes" | "conversations";

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

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Secciones del candidato"
        className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs"
      >
        <TabBtn value="profile" current={tab} onClick={setTab} label="Perfil del CV" />
        <TabBtn value="notes" current={tab} onClick={setTab} label="Notas" />
        <TabBtn
          value="conversations"
          current={tab}
          onClick={setTab}
          label="Conversaciones"
          icon={<MessageSquare className="h-3 w-3" />}
        />
      </div>

      <div>
        {tab === "profile" ? profileSlot : null}
        {tab === "notes" ? notesSlot : null}
        {tab === "conversations" ? <ConversationsStub /> : null}
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
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors",
        active
          ? "bg-foreground/[0.07] font-medium text-foreground"
          : "text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ConversationsStub() {
  return (
    <div className="rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] px-4 py-8 text-center">
      <MessageSquare
        className="mx-auto mb-2 h-5 w-5 text-foreground/40"
        aria-hidden
      />
      <p className="text-sm font-medium">Próximamente</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
        Conversaciones multi-canal de LinkedIn, WhatsApp, email, Instagram
        y Telegram vía Unipile. Veremos toda la mensajería del candidato
        en un solo hilo, junto con respuestas rápidas y templates.
      </p>
    </div>
  );
}
