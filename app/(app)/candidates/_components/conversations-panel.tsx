"use client";

import { useMemo, useState } from "react";
import { Mic, ChevronRight, MessageSquare } from "lucide-react";
import type { TranscriptListItem } from "../candidate-profile-body";
import { TranscriptViewDialog } from "./transcript-view-dialog";

/**
 * Compact "Conversaciones" panel for the candidate details split
 * view. The recruiter's most-used surface: latest interactions
 * first, one click to read the full transcript in a dialog.
 *
 * Scope: calls only for now (Granola + manual transcripts).
 * LinkedIn/email/WhatsApp messages via Unipile join this panel in a
 * future sprint — hence the muted hint at the bottom.
 */
export function ConversationsPanel({
  transcripts,
  jobTitleByApplicationId,
}: {
  transcripts: TranscriptListItem[];
  /** application_id → job title, for the per-call context chip. */
  jobTitleByApplicationId: Record<string, string>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Latest interaction first. recorded_at can be null for manual
  // rows — fall back to created_at so they don't sink to the bottom.
  const ordered = useMemo(() => {
    return [...transcripts].sort((a, b) => {
      const ta = Date.parse(a.recorded_at ?? a.created_at);
      const tb = Date.parse(b.recorded_at ?? b.created_at);
      return tb - ta;
    });
  }, [transcripts]);

  return (
    <div>
      {ordered.length === 0 ? (
        <div className="rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-6 text-center">
          <MessageSquare
            className="mx-auto mb-1.5 h-4 w-4 text-foreground/40"
            aria-hidden
          />
          <p className="text-xs text-muted-foreground">
            Sin conversaciones todavía. Sincroniza Granola desde el
            encabezado o agrega una transcripción en la pestaña
            Conversations.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {ordered.map((tr) => {
            const jobTitle = tr.application_id
              ? jobTitleByApplicationId[tr.application_id]
              : undefined;
            return (
              <li key={tr.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(tr.id)}
                  className="group flex w-full items-start gap-2.5 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {tr.title || "(sin título)"}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {tr.recorded_at
                        ? new Date(tr.recorded_at).toLocaleString("es-MX", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                      {" · "}
                      {tr.source}
                      {jobTitle ? (
                        <>
                          {" · "}
                          <span className="text-foreground/70">{jobTitle}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground/60">
        Mensajes (LinkedIn · email · WhatsApp) — próximamente
      </p>

      <TranscriptViewDialog
        transcriptId={openId}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
