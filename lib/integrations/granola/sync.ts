import "server-only";

import { hiringAdmin } from "@/lib/hiring/clients";
import { getNote, listNotes, stitchTranscript } from "./client";

/**
 * Granola → interview_transcripts ingest.
 *
 * Two entry points share the same per-note core:
 *   - processGranolaNote(noteId, workspaceId): single-note. Used by
 *     the Zapier webhook (`/api/webhooks/granola`) which fires on
 *     "New note created" in the recruiting folder.
 *   - syncGranolaTranscripts(): bulk backfill. Used by the manual
 *     "Sync now" button (`syncGranolaNowAction`) for initial loads
 *     and recovery if a webhook was missed.
 *
 * Per-note steps (shared):
 *   1. Skip if (workspace_id, source='granola', external_id=noteId)
 *      already exists. Webhook may fire twice; manual sync may pick
 *      up notes the webhook already ingested.
 *   2. GET /v1/notes/{id}?include=transcript
 *   3. Stitch segments → text blob.
 *   4. Auto-link: attendee emails → candidates → most-recent app.
 *      Owner email is the recruiter, excluded from candidate match.
 *      Exactly-1 unique candidate → application_id set; otherwise
 *      stored unlinked for the recruiter to assign manually.
 *   5. Insert into interview_transcripts.
 */

const DEFAULT_WORKSPACE_SLUG = "talental";
const MAX_PAGES_PER_RUN = 20; // bulk sync only — 30 notes × 20 = 600 notes
const INITIAL_LOOKBACK_DAYS = 90;

export type ProcessNoteResult =
  | {
      ok: true;
      action: "inserted" | "already_exists" | "skipped_empty" | "skipped_no_candidate";
      transcript_id?: string;
      application_id?: string | null;
    }
  | { ok: false; error: string };

export type GranolaSyncSummary = {
  ok: boolean;
  workspace_slug: string;
  notes_scanned: number;
  transcripts_created: number;
  transcripts_skipped_empty: number;
  linked_to_application: number;
  unlinked: number;
  errors: Array<{ note_id: string; error: string }>;
  duration_ms: number;
};

/**
 * Resolve the configured Granola workspace by slug. The slug comes
 * from GRANOLA_WORKSPACE_SLUG env (default "talental"). Returns null
 * if not found — callers should treat that as a config error, not a
 * sync error.
 */
export async function resolveGranolaWorkspaceId(): Promise<{
  ok: true;
  workspaceId: string;
  slug: string;
} | { ok: false; error: string }> {
  const slug =
    process.env.GRANOLA_WORKSPACE_SLUG?.trim() || DEFAULT_WORKSPACE_SLUG;
  const db = hiringAdmin();
  const { data: ws, error } = await db
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !ws) {
    return {
      ok: false,
      error: `Workspace '${slug}' not found: ${error?.message ?? "no row"}`,
    };
  }
  return { ok: true, workspaceId: (ws as { id: string }).id, slug };
}

/**
 * Ingest one Granola note. Idempotent by (workspace_id, source,
 * external_id) — re-running over the same note returns
 * `action='already_exists'` instead of erroring or duplicating.
 *
 * Auto-linking: a note's `owner.email` is the recruiter's Granola
 * account (always excluded from candidate-side matching). Non-owner
 * attendee emails are matched against candidates.email; if exactly
 * one unique candidate is found, the transcript is linked to that
 * candidate's most-recent application. Zero or multiple matches →
 * unlinked (application_id IS NULL); the UI surfaces these in an
 * "unlinked" tray for the recruiter to assign manually.
 *
 * Returns skipped_no_candidate when no attendee email matches any
 * candidate — the schema requires candidate_id NOT NULL, so we
 * cannot store the transcript at all in that case.
 */
export async function processGranolaNote(
  noteId: string,
  workspaceId: string,
): Promise<ProcessNoteResult> {
  const db = hiringAdmin();

  // 1. Dedupe.
  const { data: existing } = await db
    .from("interview_transcripts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("source", "granola")
    .eq("external_id", noteId)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      action: "already_exists",
      transcript_id: (existing as { id: string }).id,
    };
  }

  // 2. Fetch full note.
  const noteRes = await getNote(noteId);
  if (!noteRes.ok) {
    return { ok: false, error: noteRes.error };
  }
  const note = noteRes.data;

  // 3. Stitch transcript.
  const transcriptText = stitchTranscript(note.transcript);
  if (!transcriptText) {
    return { ok: true, action: "skipped_empty" };
  }

  // 4. Auto-link via attendee email. Owner = recruiter (excluded).
  const ownerEmail = note.owner?.email?.toLowerCase().trim();
  const attendeeEmails = note.attendees
    .map((a) => a.email?.toLowerCase().trim())
    .filter((e): e is string => Boolean(e) && e !== ownerEmail);

  let applicationId: string | null = null;
  let candidateId: string | null = null;
  if (attendeeEmails.length > 0) {
    const { data: candidateMatches } = await db
      .from("candidates")
      .select("id, email")
      .eq("workspace_id", workspaceId)
      .in("email", attendeeEmails);
    const candidates = (candidateMatches ?? []) as Array<{
      id: string;
      email: string;
    }>;
    const uniqueCandidateIds = Array.from(new Set(candidates.map((c) => c.id)));
    if (uniqueCandidateIds.length >= 1) {
      candidateId = uniqueCandidateIds[0];
      if (uniqueCandidateIds.length === 1) {
        // Single match → also resolve the most-recent application.
        const { data: appRows } = await db
          .from("applications")
          .select("id, status_changed_at")
          .eq("workspace_id", workspaceId)
          .eq("candidate_id", candidateId)
          .order("status_changed_at", { ascending: false })
          .limit(1);
        const app = (appRows ?? [])[0] as { id: string } | undefined;
        if (app) applicationId = app.id;
      }
    }
  }

  if (!candidateId) {
    return { ok: true, action: "skipped_no_candidate" };
  }

  // 5. Insert.
  const recordedAt =
    note.calendar_event?.start_time ?? note.created_at ?? null;
  const { data: inserted, error: insertErr } = await db
    .from("interview_transcripts")
    .insert({
      workspace_id: workspaceId,
      candidate_id: candidateId,
      application_id: applicationId,
      source: "granola",
      external_id: noteId,
      title: note.title,
      recorded_at: recordedAt,
      transcript: transcriptText,
      attendees: note.attendees as never,
      metadata: {
        web_url: note.web_url ?? null,
        summary_markdown: note.summary_markdown ?? null,
        folder_membership: note.folder_membership ?? [],
        calendar_event: note.calendar_event ?? null,
      } as never,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      ok: false,
      error: `Insert failed: ${insertErr?.message?.slice(0, 200) ?? "no row"}`,
    };
  }
  return {
    ok: true,
    action: "inserted",
    transcript_id: (inserted as { id: string }).id,
    application_id: applicationId,
  };
}

/**
 * Bulk sync — list Granola notes since the latest stored
 * `recorded_at` (90-day fallback on first run), dedupe vs known ids,
 * and process each fresh note. Used by the manual "Sync now" button
 * for backfill / catch-up; the day-to-day ingest is the Zapier
 * webhook which calls processGranolaNote per event.
 */
export async function syncGranolaTranscripts(): Promise<GranolaSyncSummary> {
  const t0 = Date.now();
  const summary: GranolaSyncSummary = {
    ok: false,
    workspace_slug:
      process.env.GRANOLA_WORKSPACE_SLUG?.trim() || DEFAULT_WORKSPACE_SLUG,
    notes_scanned: 0,
    transcripts_created: 0,
    transcripts_skipped_empty: 0,
    linked_to_application: 0,
    unlinked: 0,
    errors: [],
    duration_ms: 0,
  };

  const wsRes = await resolveGranolaWorkspaceId();
  if (!wsRes.ok) {
    summary.errors.push({ note_id: "", error: wsRes.error });
    summary.duration_ms = Date.now() - t0;
    return summary;
  }
  const workspaceId = wsRes.workspaceId;

  const db = hiringAdmin();
  const { data: lastRow } = await db
    .from("interview_transcripts")
    .select("recorded_at, created_at")
    .eq("workspace_id", workspaceId)
    .eq("source", "granola")
    .order("recorded_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const lastSince =
    (lastRow as { recorded_at?: string | null; created_at?: string } | null)
      ?.recorded_at ||
    (lastRow as { created_at?: string } | null)?.created_at ||
    null;
  const since = lastSince
    ? new Date(lastSince)
    : new Date(Date.now() - INITIAL_LOOKBACK_DAYS * 86400000);

  // Page through notes.
  const noteIds: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES_PER_RUN; i++) {
    const page = await listNotes({ createdAfter: since, cursor, pageSize: 30 });
    if (!page.ok) {
      summary.errors.push({ note_id: "", error: page.error });
      summary.duration_ms = Date.now() - t0;
      return summary;
    }
    for (const n of page.data.notes) noteIds.push(n.id);
    summary.notes_scanned += page.data.notes.length;
    if (!page.data.hasMore || !page.data.cursor) break;
    cursor = page.data.cursor;
  }

  for (const noteId of noteIds) {
    const res = await processGranolaNote(noteId, workspaceId);
    if (!res.ok) {
      summary.errors.push({ note_id: noteId, error: res.error });
      continue;
    }
    switch (res.action) {
      case "inserted":
        summary.transcripts_created++;
        if (res.application_id) summary.linked_to_application++;
        else summary.unlinked++;
        break;
      case "skipped_empty":
        summary.transcripts_skipped_empty++;
        break;
      case "already_exists":
        // Expected on re-runs; not counted as an error or new row.
        break;
      case "skipped_no_candidate":
        summary.errors.push({
          note_id: noteId,
          error: "No matching candidate found by attendee email",
        });
        break;
    }
  }

  summary.ok = summary.errors.length === 0;
  summary.duration_ms = Date.now() - t0;
  return summary;
}
