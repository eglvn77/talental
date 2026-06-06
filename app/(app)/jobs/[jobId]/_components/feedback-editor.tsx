"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  createJobFeedbackAction,
  deleteJobFeedbackAction,
  updateJobFeedbackAction,
  type FeedbackEntry,
  type FeedbackSource,
  FEEDBACK_SOURCES,
} from "../_actions/feedback";

/**
 * Role Calibration History — manual record of every conversation
 * that shifts the role's brief. Eventually this UI will be a
 * read-mostly timeline fed by Slack / WhatsApp / email ingesters;
 * for now everything lands here by typing.
 *
 * Each entry: a body (markdown), a source (call / slack / whatsapp /
 * email / manual / other), and the date it was received. Newest at
 * the top so the most recent calibration is the first thing the
 * recruiter sees.
 */
export function FeedbackEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: FeedbackEntry[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<FeedbackEntry[]>(initial);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [draftBody, setDraftBody] = useState("");
  const [draftSource, setDraftSource] = useState<FeedbackSource>("call");
  const [draftDate, setDraftDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );

  function submitNew() {
    if (!draftBody.trim()) return;
    start(async () => {
      const res = await createJobFeedbackAction({
        jobId,
        body: draftBody.trim(),
        source: draftSource,
        receivedAt: new Date(draftDate).toISOString(),
      });
      if (!res.ok) {
        toast.actionFailed("Guardar feedback", res.error);
        return;
      }
      setEntries((prev) => [res.data, ...prev]);
      setDraftBody("");
      setDraftSource("call");
      setDraftDate(new Date().toISOString().slice(0, 10));
      setAdding(false);
      toast.actionOk("Feedback agregado");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Cada entrada de calibración del rol. Apunta lo que el cliente dijo en
          cada llamada o canal. Próximamente esto se va a poblar automáticamente
          desde Slack, WhatsApp y correo.
        </p>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar entrada
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="space-y-3 rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Fecha
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Canal
              <select
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value as FeedbackSource)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                {FEEDBACK_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {labelForSource(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={5}
            autoFocus
            disabled={pending}
            placeholder="Qué pidió el cliente / qué cambió del brief…"
            className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setAdding(false);
                setDraftBody("");
              }}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending || !draftBody.trim()}
              onClick={submitNew}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar"
              )}
            </button>
          </div>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Sin entradas todavía. Agrega la primera para empezar el historial de
          calibración.
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <FeedbackRow
              key={e.id}
              entry={e}
              jobId={jobId}
              onChange={(next) =>
                setEntries((prev) =>
                  prev.map((p) => (p.id === next.id ? next : p)),
                )
              }
              onDelete={(id) =>
                setEntries((prev) => prev.filter((p) => p.id !== id))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedbackRow({
  entry,
  jobId,
  onChange,
  onDelete,
}: {
  entry: FeedbackEntry;
  jobId: string;
  onChange: (next: FeedbackEntry) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(entry.body);
  const [source, setSource] = useState<FeedbackSource>(entry.source);
  const [date, setDate] = useState(entry.received_at.slice(0, 10));
  const [pending, start] = useTransition();

  function save() {
    if (!body.trim()) return;
    start(async () => {
      const res = await updateJobFeedbackAction({
        entryId: entry.id,
        jobId,
        body: body.trim(),
        source,
        receivedAt: new Date(date).toISOString(),
      });
      if (!res.ok) {
        toast.actionFailed("Actualizar feedback", res.error);
        return;
      }
      onChange(res.data);
      setEditing(false);
      toast.actionOk("Actualizado");
    });
  }

  function remove() {
    if (!confirm("¿Borrar esta entrada?")) return;
    start(async () => {
      const res = await deleteJobFeedbackAction({ entryId: entry.id, jobId });
      if (!res.ok) {
        toast.actionFailed("Borrar feedback", res.error);
        return;
      }
      onDelete(entry.id);
      toast.actionOk("Borrado");
    });
  }

  if (editing) {
    return (
      <li className="space-y-3 rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as FeedbackSource)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            {FEEDBACK_SOURCES.map((s) => (
              <option key={s} value={s}>
                {labelForSource(s)}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          disabled={pending}
          className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setEditing(false);
              setBody(entry.body);
              setSource(entry.source);
              setDate(entry.received_at.slice(0, 10));
            }}
            className="rounded-md border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending || !body.trim()}
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {labelForSource(entry.source)}
          </span>
          <span>{formatDate(entry.received_at)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
            aria-label="Borrar"
            title="Borrar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm">{entry.body}</p>
    </li>
  );
}

function labelForSource(s: FeedbackSource): string {
  return (
    {
      manual: "Manual",
      call: "Llamada",
      slack: "Slack",
      whatsapp: "WhatsApp",
      email: "Correo",
      other: "Otro",
    } as Record<FeedbackSource, string>
  )[s];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
