"use client";

import { useState, useTransition } from "react";
import {
  Mic,
  Link as LinkIcon,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { CandidateMessagesSection } from "../../conversations/_components/candidate-messages-section";
import {
  addManualTranscriptAction,
  attachTranscriptToApplicationAction,
} from "../../_actions/transcripts";
import { toast } from "@/lib/toast";
import type { TranscriptListItem } from "../candidate-profile-body";
import { TranscriptViewDialog } from "./transcript-view-dialog";

export type ApplicationOption = {
  id: string;
  jobTitle: string;
};

/**
 * Lives at the top-level "Conversations" tab on the candidate
 * profile. Surfaces ALL transcripts for the candidate (across
 * applications) in chronological order, plus an "unlinked" tray
 * for orphans (application_id IS NULL) where the recruiter can
 * assign one of the candidate's applications. Below that, a
 * coming-soon placeholder for Unipile messaging so the recruiter
 * gets the right mental model for what this tab will host.
 */
export function ConversationsTab({
  candidateId,
  transcripts,
  applicationOptions,
}: {
  candidateId: string;
  transcripts: TranscriptListItem[];
  applicationOptions: ApplicationOption[];
}) {
  const linked = transcripts.filter((t) => t.application_id !== null);
  const orphans = transcripts.filter((t) => t.application_id === null);
  const [addOpen, setAddOpen] = useState(false);
  // Click a call → open the full transcript in a dialog.
  const [viewId, setViewId] = useState<string | null>(null);

  const appTitleById = new Map(
    applicationOptions.map((a) => [a.id, a.jobTitle]),
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {/* Calls */}
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Calls{transcripts.length > 0 ? ` (${transcripts.length})` : ""}
          </h3>
          <button
            type="button"
            onClick={() => setAddOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-foreground hover:bg-muted"
          >
            {addOpen ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {addOpen ? "Cancel" : "Add transcript"}
          </button>
        </div>

        {addOpen ? (
          <AddTranscriptForm
            candidateId={candidateId}
            applicationOptions={applicationOptions}
            onDone={() => setAddOpen(false)}
          />
        ) : null}

        {transcripts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No calls yet. Sync from Granola via the button on the
            candidate header, or add a manual transcript.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {linked.map((tr) => (
              <li
                key={tr.id}
                role="button"
                tabIndex={0}
                onClick={() => setViewId(tr.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setViewId(tr.id);
                }}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background px-3 py-2 transition-colors hover:bg-muted"
              >
                <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {tr.title || "(untitled)"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {tr.recorded_at
                      ? new Date(tr.recorded_at).toLocaleString("es-MX", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                    {" · "}
                    {tr.source}
                    {tr.application_id && appTitleById.get(tr.application_id) ? (
                      <>
                        {" · "}
                        <span className="text-foreground/70">
                          {appTitleById.get(tr.application_id)}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Unlinked tray */}
      {orphans.length > 0 ? (
        <section className="rounded-md border border-warning/30 bg-warning/[0.04] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-warning">
            Unlinked transcripts ({orphans.length})
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            These calls belong to this candidate but haven't been
            tied to a specific application. Assign one below so the
            report generator picks them up.
          </p>
          <ul className="mt-3 space-y-2">
            {orphans.map((tr) => (
              <OrphanRow
                key={tr.id}
                transcript={tr}
                applicationOptions={applicationOptions}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Messages (Unipile-backed) */}
      <CandidateMessagesSection candidateId={candidateId} />

      <TranscriptViewDialog
        transcriptId={viewId}
        onClose={() => setViewId(null)}
      />
    </div>
  );
}

function OrphanRow({
  transcript,
  applicationOptions,
}: {
  transcript: TranscriptListItem;
  applicationOptions: ApplicationOption[];
}) {
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function assign() {
    if (!selectedAppId) return;
    startTransition(async () => {
      const res = await attachTranscriptToApplicationAction({
        transcriptId: transcript.id,
        applicationId: selectedAppId,
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't assign transcript", res.error);
        return;
      }
      toast.actionOk("Transcript assigned");
    });
  }

  return (
    <li className="rounded-md border border-border bg-background p-2">
      <div className="flex items-start gap-3">
        <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {transcript.title || "(untitled)"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {transcript.recorded_at
              ? new Date(transcript.recorded_at).toLocaleString("es-MX", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
            {" · "}
            {transcript.source}
          </p>
        </div>
      </div>
      {applicationOptions.length > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={selectedAppId}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="">Assign to…</option>
            {applicationOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.jobTitle}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={assign}
            disabled={!selectedAppId || pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <LinkIcon className="h-3 w-3" />
            )}
            Assign
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          This candidate has no applications yet. Add the candidate to
          a job first.
        </p>
      )}
    </li>
  );
}

function AddTranscriptForm({
  candidateId,
  applicationOptions,
  onDone,
}: {
  candidateId: string;
  applicationOptions: ApplicationOption[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [appId, setAppId] = useState<string>(
    applicationOptions[0]?.id ?? "",
  );
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!transcript.trim()) return;
    startTransition(async () => {
      const res = await addManualTranscriptAction({
        candidateId,
        applicationId: appId || null,
        title: title || "Manual transcript",
        transcript,
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't add transcript", res.error);
        return;
      }
      toast.actionOk("Transcript added");
      setTitle("");
      setTranscript("");
      onDone();
    });
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Screening with Landy)"
          className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
        />
        {applicationOptions.length > 0 ? (
          <select
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
          >
            <option value="">No specific job</option>
            {applicationOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.jobTitle}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste the transcript here…"
        rows={10}
        className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm font-mono"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!transcript.trim() || pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Save transcript
        </button>
      </div>
    </div>
  );
}
