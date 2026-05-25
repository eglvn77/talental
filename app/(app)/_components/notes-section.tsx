"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { type NoteRow, type EntityType } from "@/lib/hiring";
import { createNoteAction, deleteNoteAction } from "@/app/(app)/actions";

/**
 * Shape returned by the notes pages — same as `NoteRow` but with the
 * author's name + avatar joined in so the panel can render attribution
 * without an extra round-trip per note.
 */
export type NoteWithAuthor = NoteRow & {
  author: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

/**
 * Reusable notes panel for any entity (application, candidate, company,
 * deal, contact, job). Used inside slideovers + dedicated tabs — the
 * parent supplies the entity type + id + path to revalidate.
 *
 * Permissions:
 *   - Create: any authenticated workspace member.
 *   - Delete: admins only. The delete affordance is hidden for
 *     recruiters here, and the server action enforces it too (no UI
 *     toggle can bypass the check).
 */
export function NotesSection({
  entityType,
  entityId,
  notes,
  revalidatePath: pathToRevalidate,
  isAdmin = false,
}: {
  entityType: EntityType;
  entityId: string;
  notes: NoteWithAuthor[];
  revalidatePath: string;
  /** Surfaces the delete affordance. Resolved server-side and passed
   *  in by the page; defaults false to fail-closed. */
  isAdmin?: boolean;
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
        entityType,
        entityId,
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
          placeholder="Agrega una nota…"
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
            {isPending ? "Guardando…" : "Guardar nota"}
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
              <div className="flex items-start gap-2.5">
                <Avatar
                  src={n.author?.avatar_url ?? null}
                  name={n.author?.full_name ?? null}
                  size="xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-1.5 text-xs">
                      <span className="font-medium text-foreground">
                        {n.author?.full_name ?? "Anónimo"}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("es-MX", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => remove(n.id)}
                        disabled={isPending}
                        aria-label="Eliminar nota"
                        title="Eliminar nota"
                        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
