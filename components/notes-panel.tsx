"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relativeTimeShort } from "@/lib/format";
import type { CandidateNoteRow } from "@/lib/supabase";

const MAX_NAME_LEN = 80;
const MAX_NOTE_LEN = 4000;

type Props = {
  portalSlug: string;
  candidateSlug: string;
  layout?: "modal" | "inline";
};

export function NotesPanel({ portalSlug, candidateSlug, layout = "modal" }: Props) {
  const endpoint = `/api/portal/${portalSlug}/candidates/${candidateSlug}/notes`;
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const noteId = `${baseId}-note`;

  const [notes, setNotes] = useState<CandidateNoteRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const r = await fetch(endpoint, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: { notes: CandidateNoteRow[] } = await r.json();
      setNotes(data.notes);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = authorName.trim();
    const text = noteText.trim();
    if (!name || !text) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_name: name, note_text: text }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      const data: { note: CandidateNoteRow } = await r.json();
      setNotes((prev) => (prev ? [data.note, ...prev] : [data.note]));
      setNoteText("");
      noteRef.current?.focus();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  const wrapperClass = layout === "inline" ? "" : "flex flex-col gap-4";

  return (
    <div className={wrapperClass}>
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor={nameId} className="sr-only">
          Your name
        </label>
        <Input
          id={nameId}
          type="text"
          placeholder="Your name"
          required
          maxLength={MAX_NAME_LEN}
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          disabled={submitting}
        />
        <label htmlFor={noteId} className="sr-only">
          Note about this candidate
        </label>
        <textarea
          ref={noteRef}
          id={noteId}
          placeholder="Add a note about this candidate"
          required
          maxLength={MAX_NOTE_LEN}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          disabled={submitting}
          rows={3}
          className="flex min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm transition-[color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-red-600">{submitError}</span>
          <Button
            type="submit"
            size="sm"
            disabled={submitting || !authorName.trim() || !noteText.trim()}
            className="disabled:opacity-100! disabled:bg-muted disabled:text-muted-foreground"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Add note"
            )}
          </Button>
        </div>
      </form>

      <div className="mt-4 flex flex-col gap-3">
        {notes === null && !loadError ? (
          <p className="text-xs text-muted-foreground">Loading notes…</p>
        ) : loadError ? (
          <p className="text-xs text-red-600">Couldn&apos;t load notes: {loadError}</p>
        ) : notes && notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No notes yet. Be the first to leave one.
          </p>
        ) : (
          notes?.map((n, i) => (
            <div
              key={n.id}
              className={i === 0 ? "" : "border-t border-border pt-3"}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {n.author_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {relativeTimeShort(n.created_at) ?? ""}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                {n.note_text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
