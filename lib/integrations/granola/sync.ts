import "server-only";

import { hiringAdmin } from "@/lib/hiring/clients";
import { getNote, listNotes, stitchTranscript } from "./client";

/**
 * Granola → interview_transcripts sync.
 *
 * Strategy:
 *   1. Resolve target workspace by slug (env GRANOLA_WORKSPACE_SLUG,
 *      defaults to "talental"). Multi-tenant Granola will need a
 *      workspace_integrations table; that's a separate phase.
 *   2. Compute `created_after`:
 *        - max(recorded_at) of existing source='granola' rows
 *        - fallback: 90 days ago
 *   3. Paginate /v1/notes (max 30/page, capped at MAX_PAGES per run).
 *   4. For each new note id (one not already in interview_transcripts):
 *        - GET /v1/notes/{id}?include=transcript
 *        - Stitch transcript segments → text blob
 *        - Auto-link: find candidate by attendee email, then most
 *          recent application; link if exactly 1 match.
 *        - Upsert by (workspace_id, source='granola', external_id).
 *   5. Return summary for the cron/route to surface.
 *
 * Idempotent: external_id has a unique constraint, so re-running the
 * sync over the same window doesn't duplicate. Updates would still
 * be missed (we don't re-fetch already-known ids) — fine for V1
 * since transcripts don't change post-recording.
 *
 * Used by both `/api/cron/granola-sync` (Vercel cron) and the manual
 * `syncGranolaNowAction` (server action triggered from UI).
 */

const DEFAULT_WORKSPACE_SLUG = "talental";
const MAX_PAGES_PER_RUN = 20; // 30 notes × 20 = 600 notes max per run
const INITIAL_LOOKBACK_DAYS = 90;

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

export async function syncGranolaTranscripts(): Promise<GranolaSyncSummary> {
  const t0 = Date.now();
  const workspaceSlug =
    process.env.GRANOLA_WORKSPACE_SLUG?.trim() || DEFAULT_WORKSPACE_SLUG;

  const summary: GranolaSyncSummary = {
    ok: false,
    workspace_slug: workspaceSlug,
    notes_scanned: 0,
    transcripts_created: 0,
    transcripts_skipped_empty: 0,
    linked_to_application: 0,
    unlinked: 0,
    errors: [],
    duration_ms: 0,
  };

  // 1. Resolve workspace_id.
  const db = hiringAdmin();
  const { data: ws, error: wsErr } = await db
    .from("workspaces")
    .select("id")
    .eq("slug", workspaceSlug)
    .maybeSingle();
  if (wsErr || !ws) {
    summary.errors.push({
      note_id: "",
      error: `Workspace '${workspaceSlug}' not found: ${wsErr?.message ?? "no row"}`,
    });
    summary.duration_ms = Date.now() - t0;
    return summary;
  }
  const workspaceId = (ws as { id: string }).id;

  // 2. Compute since cutoff.
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

  // 3. Paginate list endpoint.
  const candidateNotes: Array<{ id: string }> = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES_PER_RUN; i++) {
    const page = await listNotes({ createdAfter: since, cursor, pageSize: 30 });
    if (!page.ok) {
      summary.errors.push({ note_id: "", error: page.error });
      summary.duration_ms = Date.now() - t0;
      return summary;
    }
    for (const n of page.data.notes) {
      candidateNotes.push({ id: n.id });
    }
    summary.notes_scanned += page.data.notes.length;
    if (!page.data.hasMore || !page.data.cursor) break;
    cursor = page.data.cursor;
  }

  if (candidateNotes.length === 0) {
    summary.ok = true;
    summary.duration_ms = Date.now() - t0;
    return summary;
  }

  // 3b. Dedupe vs already-stored external_ids (skip second API call
  // for notes we already have, saves rate budget + latency).
  const ids = candidateNotes.map((n) => n.id);
  const { data: existingRows } = await db
    .from("interview_transcripts")
    .select("external_id")
    .eq("workspace_id", workspaceId)
    .eq("source", "granola")
    .in("external_id", ids);
  const known = new Set(
    (existingRows ?? []).map(
      (r) => (r as { external_id: string }).external_id,
    ),
  );
  const fresh = candidateNotes.filter((n) => !known.has(n.id));

  if (fresh.length === 0) {
    summary.ok = true;
    summary.duration_ms = Date.now() - t0;
    return summary;
  }

  // 4. Fetch each fresh note with transcript + insert. Sequential to
  // respect Granola's rate limits (unspecified; play it safe).
  for (const { id: noteId } of fresh) {
    const noteRes = await getNote(noteId);
    if (!noteRes.ok) {
      summary.errors.push({ note_id: noteId, error: noteRes.error });
      continue;
    }
    const note = noteRes.data;
    const transcriptText = stitchTranscript(note.transcript);
    if (!transcriptText) {
      summary.transcripts_skipped_empty++;
      continue;
    }

    // Auto-link via attendee email. Owner is the recruiter (don't
    // count them as candidate). Non-owner attendees → look up
    // candidates by email.
    const ownerEmail = note.owner?.email?.toLowerCase().trim();
    const attendeeEmails = note.attendees
      .map((a) => a.email?.toLowerCase().trim())
      .filter((e): e is string => Boolean(e) && e !== ownerEmail);

    let applicationId: string | null = null;
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
      const uniqueCandidateIds = Array.from(
        new Set(candidates.map((c) => c.id)),
      );
      if (uniqueCandidateIds.length === 1) {
        const candidateId = uniqueCandidateIds[0];
        // Most recent application for this candidate in this workspace.
        const { data: appRows } = await db
          .from("applications")
          .select("id, status_changed_at")
          .eq("workspace_id", workspaceId)
          .eq("candidate_id", candidateId)
          .order("status_changed_at", { ascending: false })
          .limit(1);
        const app = (appRows ?? [])[0] as { id: string } | undefined;
        if (app) {
          applicationId = app.id;
        }
      }
    }

    // Find candidate_id even if no application linked — the row needs
    // candidate_id NOT NULL per schema. Resolve from the matched
    // candidate list above OR best-effort from any attendee email.
    let candidateId: string | null = null;
    if (attendeeEmails.length > 0) {
      const { data: anyMatch } = await db
        .from("candidates")
        .select("id")
        .eq("workspace_id", workspaceId)
        .in("email", attendeeEmails)
        .limit(1)
        .maybeSingle();
      candidateId = (anyMatch as { id?: string } | null)?.id ?? null;
    }

    if (!candidateId) {
      // No candidate match — can't store the transcript (schema requires
      // candidate_id NOT NULL). Skip and report.
      summary.errors.push({
        note_id: noteId,
        error: "No matching candidate found by attendee email",
      });
      continue;
    }

    const recordedAt =
      note.calendar_event?.start_time ?? note.created_at ?? null;
    const { error: insertErr } = await db
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
      });
    if (insertErr) {
      summary.errors.push({
        note_id: noteId,
        error: `Insert failed: ${insertErr.message.slice(0, 200)}`,
      });
      continue;
    }
    summary.transcripts_created++;
    if (applicationId) summary.linked_to_application++;
    else summary.unlinked++;
  }

  summary.ok = summary.errors.length === 0;
  summary.duration_ms = Date.now() - t0;
  return summary;
}
