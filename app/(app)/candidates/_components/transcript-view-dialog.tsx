"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Mic, X } from "lucide-react";
import { getTranscriptTextAction } from "@/app/(app)/_actions/transcripts";

/**
 * Full-text transcript viewer. Controlled dialog — the parent passes
 * the transcript id when the recruiter clicks a call row; we fetch
 * the body lazily (list payloads only carry metadata).
 */
export function TranscriptViewDialog({
  transcriptId,
  onClose,
}: {
  /** Null = closed. */
  transcriptId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    title: string | null;
    transcript: string;
    recorded_at: string | null;
    source: string;
  } | null>(null);

  useEffect(() => {
    if (!transcriptId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getTranscriptTextAction({ transcriptId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [transcriptId]);

  return (
    <Dialog.Root open={transcriptId !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(95vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background shadow-modal">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <Dialog.Title className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {data?.title || "Transcripción"}
              </span>
            </Dialog.Title>
            <div className="flex shrink-0 items-center gap-3">
              {data?.recorded_at ? (
                <span className="text-xs text-muted-foreground">
                  {new Date(data.recorded_at).toLocaleString("es-MX", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
              <Dialog.Close
                aria-label="Cerrar"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : data ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">
                {data.transcript}
              </pre>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
