"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type NoteRow } from "@/lib/hiring";
import { createNoteAction, deleteNoteAction } from "../../actions";

export function NotesSection({
  applicationId,
  notes,
  revalidatePath: pathToRevalidate,
}: {
  applicationId: string;
  notes: NoteRow[];
  revalidatePath: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const res = await createNoteAction({
        entityType: "application",
        entityId: applicationId,
        body: text,
        revalidate: pathToRevalidate,
      });
      if (!res.ok) setError(res.error);
      else {
        setBody("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteNoteAction({
        noteId: id,
        revalidate: pathToRevalidate,
      });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Agrega una nota sobre este candidato…"
          rows={3}
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">⌘↵ para guardar</span>
          <Button
            size="sm"
            onClick={submit}
            disabled={isPending || body.trim().length === 0}
          >
            {isPending ? "Guardando…" : "Agregar nota"}
          </Button>
        </div>
        {error ? (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        ) : null}
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin notas todavía.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="group rounded-md border border-border bg-muted/20 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  disabled={isPending}
                  aria-label="Eliminar nota"
                  className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
