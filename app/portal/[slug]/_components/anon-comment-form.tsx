"use client";

import { useState, useTransition } from "react";
import { Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import { portalPostAnonCommentAction } from "../actions";
import { useRouter } from "next/navigation";

/**
 * Public-link comment form. No email gate — visitor types a name +
 * optional comment + optional thumb, hits Send. Reuses the
 * portalPostAnonCommentAction server action which validates the
 * token's scope='application' before inserting.
 */
export function AnonCommentForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [sentiment, setSentiment] = useState<"up" | "down" | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (!name.trim()) {
      setErr("Necesitamos tu nombre");
      return;
    }
    if (!body.trim() && !sentiment) {
      setErr("Agrega un comentario o tu reacción");
      return;
    }
    startTransition(async () => {
      const res = await portalPostAnonCommentAction({
        slug,
        authorName: name,
        body: body || undefined,
        sentiment,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setBody("");
      setSentiment(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tu nombre"
        maxLength={80}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Tu comentario (opcional)"
        rows={3}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSentiment((s) => (s === "up" ? null : "up"))}
            className={
              "inline-flex h-7 w-7 items-center justify-center rounded-md border " +
              (sentiment === "up"
                ? "border-positive bg-positive/10 text-positive"
                : "border-border bg-background text-muted-foreground hover:bg-muted")
            }
            aria-label="Thumbs up"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setSentiment((s) => (s === "down" ? null : "down"))}
            className={
              "inline-flex h-7 w-7 items-center justify-center rounded-md border " +
              (sentiment === "down"
                ? "border-warning bg-warning/10 text-warning"
                : "border-border bg-background text-muted-foreground hover:bg-muted")
            }
            aria-label="Thumbs down"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Enviar
        </button>
      </div>
      {err ? <p className="text-xs text-warning">{err}</p> : null}
    </div>
  );
}
