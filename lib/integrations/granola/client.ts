import "server-only";

/**
 * Granola REST client — wraps the meeting-notes public API.
 *
 * - Base: https://public-api.granola.ai (yes, the `public-api` subdomain
 *   — the older `api.granola.ai` host is for installer downloads, not
 *   the data API)
 * - Auth: `Authorization: Bearer ${GRANOLA_API_KEY}` (token format
 *   `grn_*`)
 * - Two endpoints we touch:
 *     GET /v1/notes              → list summaries (no transcript), paginated
 *     GET /v1/notes/{id}?include=transcript → full note with segments
 *
 * Failure shape mirrors `lib/sourcing/_internal/coresignal-raw.ts`:
 * `{ok:false, status, error}` so callers branch without try/catch.
 *
 * Internal module — every caller must route through
 * `lib/sourcing/granola.ts` (TBD) for caching + per-run logging, or
 * through the `/api/cron/granola-sync` route which already enforces
 * those guarantees.
 */

const BASE = "https://public-api.granola.ai";
const DEFAULT_PAGE_SIZE = 30; // API max

function apiKey(): string {
  const k = process.env.GRANOLA_API_KEY;
  if (!k) throw new Error("Missing GRANOLA_API_KEY");
  return k;
}

export type GranolaError = {
  ok: false;
  status: number;
  error: string;
};

export type GranolaUser = {
  name: string | null;
  email: string;
};

/** Lightweight shape returned by /v1/notes — no transcript. */
export type GranolaNoteSummary = {
  id: string;
  object: "note";
  title: string | null;
  owner: GranolaUser;
  created_at: string;
  updated_at: string;
};

/** Full shape returned by GET /v1/notes/{id}?include=transcript. */
export type GranolaNote = GranolaNoteSummary & {
  web_url?: string;
  calendar_event: {
    id: string;
    object: "calendar_event";
    title: string | null;
    start_time: string | null;
    end_time: string | null;
  } | null;
  attendees: Array<GranolaUser>;
  folder_membership: Array<{
    id: string;
    object: "folder";
    name: string;
    parent_folder_id: string | null;
  }>;
  summary_text: string | null;
  summary_markdown: string | null;
  transcript: Array<GranolaTranscriptSegment> | null;
};

export type GranolaTranscriptSegment = {
  speaker: {
    source: "microphone" | "speaker";
    diarization_label?: string;
  };
  text: string;
  start_time?: string;
  end_time?: string;
};

type ListNotesResponse = {
  notes: GranolaNoteSummary[];
  hasMore: boolean;
  cursor: string | null;
};

/**
 * List notes, paginated. Returns ONE page. Caller drives the cursor
 * loop (`/api/cron/granola-sync` does this with a safety cap so a
 * runaway API never blows the cron's max duration).
 */
export async function listNotes(opts: {
  createdAfter?: Date;
  updatedAfter?: Date;
  cursor?: string;
  pageSize?: number;
}): Promise<{ ok: true; data: ListNotesResponse } | GranolaError> {
  const params = new URLSearchParams();
  if (opts.createdAfter) params.set("created_after", opts.createdAfter.toISOString());
  if (opts.updatedAfter) params.set("updated_after", opts.updatedAfter.toISOString());
  if (opts.cursor) params.set("cursor", opts.cursor);
  params.set("page_size", String(opts.pageSize ?? DEFAULT_PAGE_SIZE));

  const url = `${BASE}/v1/notes?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiKey()}`,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      error: `listNotes ${res.status}: ${text.slice(0, 300) || res.statusText}`,
    };
  }
  const data = (await res.json()) as ListNotesResponse;
  return { ok: true, data };
}

/**
 * Fetch a single note with its full transcript. The list endpoint
 * intentionally omits transcripts to keep paging cheap, so the sync
 * pattern is: list summaries → for each new id, getNote().
 */
export async function getNote(
  noteId: string,
): Promise<{ ok: true; data: GranolaNote } | GranolaError> {
  if (!/^not_[A-Za-z0-9]{14}$/.test(noteId)) {
    return { ok: false, status: 0, error: `Invalid Granola note id: ${noteId}` };
  }
  const url = `${BASE}/v1/notes/${encodeURIComponent(noteId)}?include=transcript`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiKey()}`,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      error: `getNote(${noteId}) ${res.status}: ${text.slice(0, 300) || res.statusText}`,
    };
  }
  const data = (await res.json()) as GranolaNote;
  return { ok: true, data };
}

/**
 * Stitch a transcript segment array into a single text blob suitable
 * for feeding to an LLM. Format: `[speaker source] text` per line,
 * preserving order. The microphone is the recruiter (Talental's
 * Granola is recording from their laptop); the speaker is whoever
 * else is in the call. Diarization labels are used when present
 * (iOS / future macOS).
 *
 * Returns an empty string when no segments exist — caller decides
 * whether to skip persisting a transcript with no content.
 */
export function stitchTranscript(segments: GranolaTranscriptSegment[] | null): string {
  if (!segments || segments.length === 0) return "";
  const lines: string[] = [];
  for (const s of segments) {
    const txt = (s.text ?? "").trim();
    if (!txt) continue;
    const label =
      s.speaker?.diarization_label ||
      (s.speaker?.source === "microphone"
        ? "Recruiter"
        : s.speaker?.source === "speaker"
          ? "Candidate"
          : "Unknown");
    lines.push(`[${label}] ${txt}`);
  }
  return lines.join("\n");
}
