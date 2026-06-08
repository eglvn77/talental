"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createNoteAction } from "@/app/(app)/actions";

type Note = {
  id: string;
  body: string;
  created_at: string;
  author: { full_name: string } | Array<{ full_name: string }> | null;
};

/**
 * Compact notes section. Shows last 5 notes plus a quick-add
 * textarea. Save reloads the iframe so the new note appears at top.
 */
export function SlimNotes({
  candidateId,
  notes,
}: {
  candidateId: string;
  notes: Note[];
}) {
  const [draft, setDraft] = useState("");
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    const body = draft.trim();
    if (!body) return;
    setErr(null);
    startSave(async () => {
      const res = await createNoteAction({
        entityType: "candidate",
        entityId: candidateId,
        body,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setDraft("");
      window.location.reload();
    });
  }

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Notas ({notes.length})
      </h2>
      <div className="mt-2 space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Agregar nota…"
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim() || saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-2 py-1 text-xs font-medium text-bone hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            Guardar
          </button>
          {err ? (
            <span className="text-xs text-danger">{err}</span>
          ) : null}
        </div>
      </div>
      {notes.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {notes.map((n) => {
            const author = Array.isArray(n.author) ? n.author[0] : n.author;
            return (
              <li
                key={n.id}
                className="rounded-md border border-border bg-card px-2 py-1.5"
              >
                <p className="whitespace-pre-wrap text-xs">{n.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {author?.full_name ?? "—"} ·{" "}
                  {new Date(n.created_at).toLocaleString("es-MX", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
