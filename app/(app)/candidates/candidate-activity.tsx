"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  StickyNote,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import type { NoteWithAuthor } from "@/app/(app)/_components/notes-section";
import { createNoteAction, deleteNoteAction } from "@/app/(app)/actions";

/** A stage-change (or other application_event) flattened for display. */
export type ActivityEvent = {
  id: string;
  created_at: string;
  event_type: string;
  actor: string | null;
  jobTitle: string | null;
  fromStage: string | null;
  toStage: string | null;
};

type Filter = "all" | "notes" | "stages";

type Item =
  | { kind: "note"; at: string; note: NoteWithAuthor }
  | { kind: "event"; at: string; event: ActivityEvent };

/**
 * Candidate Actividad tab. One chronological feed merging internal
 * notes with pipeline events across every job the candidate is in.
 * Compose a note up top; filter the feed by type.
 */
export function CandidateActivity({
  candidateId,
  notes,
  events,
  revalidatePath,
  isAdmin,
}: {
  candidateId: string;
  notes: NoteWithAuthor[];
  events: ActivityEvent[];
  revalidatePath: string;
  isAdmin: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();

  const items = useMemo<Item[]>(() => {
    const merged: Item[] = [
      ...notes.map((n) => ({ kind: "note" as const, at: n.created_at, note: n })),
      ...events.map((e) => ({ kind: "event" as const, at: e.created_at, event: e })),
    ];
    merged.sort((a, b) => b.at.localeCompare(a.at));
    if (filter === "notes") return merged.filter((i) => i.kind === "note");
    if (filter === "stages") return merged.filter((i) => i.kind === "event");
    return merged;
  }, [notes, events, filter]);

  function submit() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await createNoteAction({
        entityType: "candidate",
        entityId: candidateId,
        body: text,
        revalidate: revalidatePath,
      });
      if (!res.ok) {
        toast.saveFailed(res.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  function removeNote(id: string) {
    start(async () => {
      const res = await deleteNoteAction({ noteId: id, revalidate: revalidatePath });
      if (!res.ok) toast.saveFailed(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Composer */}
      <div className="rounded-md border border-border bg-card p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("shared.notesPlaceholder")}
          rows={3}
          disabled={pending}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t("shared.notesSaveHint")}
          </span>
          <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
            {pending ? t("shared.notesSaving") : t("shared.notesSave")}
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 text-xs">
        <FilterChip current={filter} value="all" onClick={setFilter} label={t("activity.filterAll")} />
        <FilterChip current={filter} value="notes" onClick={setFilter} label={t("activity.filterNotes")} />
        <FilterChip current={filter} value="stages" onClick={setFilter} label={t("activity.filterStages")} />
      </div>

      {/* Feed */}
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("activity.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) =>
            item.kind === "note" ? (
              <NoteItem
                key={`n-${item.note.id}`}
                note={item.note}
                isAdmin={isAdmin}
                onDelete={() => removeNote(item.note.id)}
                pending={pending}
              />
            ) : (
              <EventItem key={`e-${item.event.id}`} event={item.event} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  value,
  current,
  onClick,
  label,
}: {
  value: Filter;
  current: Filter;
  onClick: (f: Filter) => void;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "rounded-full border px-2.5 py-1 transition-colors",
        active
          ? "border-accent bg-accent/10 font-medium text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function NoteItem({
  note,
  isAdmin,
  onDelete,
  pending,
}: {
  note: NoteWithAuthor;
  isAdmin: boolean;
  onDelete: () => void;
  pending: boolean;
}) {
  const t = useT();
  return (
    <li className="group rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
          <StickyNote className="h-3 w-3" />
        </span>
        <Avatar
          src={note.author?.avatar_url ?? null}
          name={note.author?.full_name ?? null}
          size="xs"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5 text-xs">
              <span className="font-medium text-foreground">
                {note.author?.full_name ?? t("shared.notesAnonymous")}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{fmt(note.created_at)}</span>
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                aria-label={t("shared.notesDelete")}
                title={t("shared.notesDelete")}
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p>
        </div>
      </div>
    </li>
  );
}

function EventItem({ event }: { event: ActivityEvent }) {
  const t = useT();
  return (
    <li className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-600">
        <ArrowRightLeft className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        {event.event_type === "stage_changed" ? (
          <span>
            {t("activity.stageMoved")}{" "}
            <span className="font-medium">{event.fromStage ?? "—"}</span>
            {" → "}
            <span className="font-medium">{event.toStage ?? "—"}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{event.event_type}</span>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {event.jobTitle ? <span>{event.jobTitle}</span> : null}
          {event.jobTitle ? <span>·</span> : null}
          <span>{fmt(event.created_at)}</span>
          {event.actor ? (
            <>
              <span>·</span>
              <span>{event.actor}</span>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
