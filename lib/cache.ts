import { customAlphabet } from "nanoid";
import { after } from "next/server";
import { getSupabaseAdmin, type CandidateCacheRow } from "./supabase";
import {
  extractCurrencyAndFrequency,
  extractCurrentComp,
  extractDroppedAt,
  extractLinkedinUrl,
  extractLocation,
  extractSubmittedAt,
  getCandidate,
  getCandidateAttachments,
  getCandidateSocialMedia,
  getJob,
  listJobMatches,
  type ManatalMatch,
} from "./manatal";

const CACHE_TTL_MS = 15 * 60 * 1000;

// Refresh batching. Each candidate fans out to 2 Manatal endpoints
// (detail + social-media). Resume presence comes from candidate.resume on the
// detail response; the candidate report comes from candidate.custom_fields.candidatereport.
// Attachments / experiences / educations are fetched lazily on the deep-link page,
// not during refresh.
const REFRESH_WAVE_SIZE = 4;
const REFRESH_WAVE_GAP_MS = 1000;

// Lock lease: long enough to cover the slowest plausible refresh (rate-limited
// edge cases), short enough that a crashed worker's lock doesn't block forever.
const REFRESH_LOCK_LEASE_MS = 5 * 60 * 1000;

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const newCandidateSlug = customAlphabet(SLUG_ALPHABET, 12);

const REPORT_CUSTOM_FIELD_KEY = "candidatereport";

export async function getCandidatesForJob(
  jobId: number,
): Promise<CandidateCacheRow[]> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error } = await supabase
    .from("candidate_cache")
    .select("*")
    .eq("manatal_job_id", jobId)
    .eq("is_active_match", true)
    .order("stage_rank", { ascending: false, nullsFirst: false })
    .order("candidate_full_name", { ascending: true });

  if (error) throw error;
  const rows = (existing ?? []) as CandidateCacheRow[];

  const now = Date.now();
  const oldest = rows.reduce<number>(
    (acc, r) => Math.min(acc, new Date(r.last_synced_at).getTime()),
    now,
  );

  // Warm cache (any rows) → stale-while-revalidate: serve immediately, refresh
  // in the background if stale. The user never waits on Manatal.
  if (rows.length > 0) {
    const isStale = now - oldest > CACHE_TTL_MS;
    if (isStale) {
      after(async () => {
        try {
          const result = await tryRefreshJobCache(jobId);
          if (result === "contended") {
            console.log(`[cache] background refresh for job ${jobId} contended; skipping`);
          }
        } catch (err) {
          console.error("[cache] background refresh failed for job", jobId, err);
        }
      });
    }
    return rows;
  }

  // Cold cache → must wait. Auto-warm should make this rare.
  try {
    const result = await tryRefreshJobCache(jobId);
    if (result === "contended") {
      return await waitForCachePopulated(jobId, rows);
    }
    return result;
  } catch (err) {
    console.error("[cache] refresh failed for job", jobId, err);
    throw err;
  }
}

export type CandidateCounters = {
  inProcess: number;
  submitted: number;
  rejected: number;
};

export async function getCandidateCountersForJob(
  jobId: number,
): Promise<CandidateCounters> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("candidate_cache")
    .select("is_active_match, submitted_at, dropped_at")
    .eq("manatal_job_id", jobId);
  const rows = (data ?? []) as Array<{
    is_active_match: boolean;
    submitted_at: string | null;
    dropped_at: string | null;
  }>;
  let inProcess = 0;
  let submitted = 0;
  let rejected = 0;
  for (const r of rows) {
    if (r.is_active_match && !r.submitted_at) inProcess++;
    if (r.submitted_at) submitted++;
    if (r.dropped_at) rejected++;
  }
  return { inProcess, submitted, rejected };
}

// Lock-aware refresh. Acquires the cross-process advisory lock; if another
// worker holds it, returns "contended" without doing any work. Used by every
// path that wants to refresh a job (on-demand, cron, auto-warm, manual). This
// is the single source of truth for "should I actually run a refresh right now".
export async function tryRefreshJobCache(
  jobId: number,
): Promise<CandidateCacheRow[] | "contended"> {
  const acquiredAt = await tryAcquireRefreshLock(jobId);
  if (!acquiredAt) return "contended";
  try {
    return await refreshJobCache(jobId);
  } finally {
    await releaseRefreshLock(jobId, acquiredAt);
  }
}

async function tryAcquireRefreshLock(jobId: number): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("try_acquire_refresh_lock", {
    p_job_id: jobId,
    p_lease_ms: REFRESH_LOCK_LEASE_MS,
  });
  if (error) {
    console.error("[cache] try_acquire_refresh_lock failed", error);
    return null;
  }
  return typeof data === "string" ? data : null;
}

async function releaseRefreshLock(jobId: number, acquiredAt: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("release_refresh_lock", {
    p_job_id: jobId,
    p_acquired_at: acquiredAt,
  });
  if (error) console.error("[cache] release_refresh_lock failed", error);
}

async function waitForCachePopulated(
  jobId: number,
  prevRows: CandidateCacheRow[],
): Promise<CandidateCacheRow[]> {
  const supabase = getSupabaseAdmin();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await supabase
      .from("candidate_cache")
      .select("*")
      .eq("manatal_job_id", jobId)
      .eq("is_active_match", true)
      .order("candidate_full_name", { ascending: true });
    const fresh = (data ?? []) as CandidateCacheRow[];
    if (fresh.length > 0) return fresh;
  }
  return prevRows;
}

export async function refreshJobCache(
  jobId: number,
): Promise<CandidateCacheRow[]> {
  const supabase = getSupabaseAdmin();

  const debugDelayMs = Number(process.env.DEBUG_CACHE_DELAY_MS);
  if (Number.isFinite(debugDelayMs) && debugDelayMs > 0) {
    await new Promise((r) => setTimeout(r, debugDelayMs));
  }

  // Pre-fetch existing rows so we (1) preserve slugs across refreshes and
  // (2) know whether a row already has good data — used to decide whether to
  // skip the upsert when this refresh's candidate detail fetch fails
  // (typically a 429 against Manatal's shared rate limit).
  const { data: existingRows } = await supabase
    .from("candidate_cache")
    .select("manatal_match_id, candidate_slug, raw_candidate_json")
    .eq("manatal_job_id", jobId);
  const existingByMatch = new Map<
    number,
    { slug: string; hasUsableData: boolean }
  >(
    (existingRows ?? []).map((r) => [
      r.manatal_match_id,
      { slug: r.candidate_slug, hasUsableData: r.raw_candidate_json !== null },
    ]),
  );

  // Pull job description once per refresh and persist on every portal_links
  // row pointing at this job_id. Stored raw; sanitized at render time.
  try {
    const job = await getJob(jobId);
    const description = typeof job.description === "string" ? job.description : null;
    await supabase
      .from("portal_links")
      .update({ job_description: description })
      .eq("manatal_job_id", jobId);
  } catch (err) {
    console.warn(`[cache] failed to refresh job description for ${jobId}`, err);
  }

  const matches = await listJobMatches(jobId);

  type PreservePatch = {
    matchId: number;
    is_active_match: boolean;
    match_is_active: boolean;
    submitted_at: string | null;
    dropped_at: string | null;
    raw_match_json: ManatalMatch;
  };
  type EnrichResult =
    | { kind: "upsert"; row: Record<string, unknown> }
    | { kind: "preserve"; patch: PreservePatch }
    | null;

  const enriched: EnrichResult[] = await mapInWaves(
    matches,
    REFRESH_WAVE_SIZE,
    REFRESH_WAVE_GAP_MS,
    async (match): Promise<EnrichResult> => {
      const candidateId = resolveCandidateId(match);
      if (!candidateId) return null;

      const matchIsActive = match.is_active !== false;
      const droppedAt = extractDroppedAt(match);
      const submittedAt = extractSubmittedAt(match);
      // Derived flag for "show in pipeline view": Manatal's is_active flag
      // OR a non-null dropped_at means the candidate has left the funnel.
      const isActiveMatch = matchIsActive && !droppedAt;

      // Three endpoints per candidate. /attachments/ is fetched only for its
      // count (so the table can hide the Files button when there's nothing
      // to show); the list itself is re-fetched fresh when the dropdown opens.
      const [candidate, social, attachments] = await Promise.all([
        getCandidate(candidateId).catch(() => null),
        getCandidateSocialMedia(candidateId).catch(() => null),
        getCandidateAttachments(candidateId).catch(() => []),
      ]);

      // If the detail fetch failed (typically 429), don't clobber an existing
      // good row with placeholder data. Preserve it; we'll just bump the
      // match-level fields (which we already have from listJobMatches).
      if (!candidate) {
        const existing = existingByMatch.get(match.id);
        if (existing?.hasUsableData) {
          console.warn(
            `[cache] skipping upsert for match ${match.id} (candidate ${candidateId}) — detail fetch failed and existing row preserved`,
          );
          return {
            kind: "preserve",
            patch: {
              matchId: match.id,
              is_active_match: isActiveMatch,
              match_is_active: matchIsActive,
              submitted_at: submittedAt,
              dropped_at: droppedAt,
              raw_match_json: match,
            },
          };
        }
        console.warn(
          `[cache] writing partial row for match ${match.id} (candidate ${candidateId}) — no prior data available`,
        );
      }

      const linkedin = extractLinkedinUrl(social, candidate);
      const location = extractLocation(candidate);
      const currentCompAmount = extractCurrentComp(candidate);
      const { currency: currentCompCurrency, frequency: currentCompFrequency } =
        extractCurrencyAndFrequency(candidate);
      const fullName =
        candidate?.full_name ||
        match.full_name ||
        (typeof match.candidate === "object" && match.candidate?.full_name) ||
        `Candidate ${candidateId}`;

      // has_resume comes from candidate.resume (top-level URL on detail response).
      // No separate /resume/ call needed.
      const hasResume = Boolean(
        candidate?.resume && typeof candidate.resume === "string" && candidate.resume.trim(),
      );

      const cf = candidate?.custom_fields;
      const reportRaw =
        cf && typeof cf === "object" && REPORT_CUSTOM_FIELD_KEY in cf
          ? cf[REPORT_CUSTOM_FIELD_KEY]
          : null;
      const candidateReportHtml =
        typeof reportRaw === "string" && reportRaw.trim().length > 0
          ? reportRaw
          : null;

      const slug = existingByMatch.get(match.id)?.slug ?? newCandidateSlug();

      // job_pipeline_stage.rank is Manatal's per-pipeline ordering of stages.
      // Higher rank = more advanced. Cache it so we can sort the table without
      // re-deriving from raw_match_json.
      const stageRank = (() => {
        const m = match as unknown as {
          job_pipeline_stage?: { rank?: number };
        };
        const r = m.job_pipeline_stage?.rank;
        return typeof r === "number" && Number.isFinite(r) ? r : null;
      })();

      return {
        kind: "upsert",
        row: {
          manatal_job_id: jobId,
          manatal_match_id: match.id,
          manatal_candidate_id: candidateId,
          candidate_slug: slug,
          candidate_full_name: fullName,
          stage_name: match.stage?.name ?? null,
          stage_rank: stageRank,
          linkedin_url: linkedin,
          has_resume: hasResume,
          attachment_count: attachments.length,
          // raw_attachments_json / raw_experiences_json / raw_educations_json
          // are NOT populated here — they're lazy-loaded on the deep-link page.
          email: typeof candidate?.email === "string" ? candidate.email : null,
          current_company:
            typeof candidate?.current_company === "string"
              ? candidate.current_company
              : null,
          current_position:
            typeof candidate?.current_position === "string"
              ? candidate.current_position
              : null,
          description:
            typeof candidate?.description === "string" ? candidate.description : null,
          candidate_report_html: candidateReportHtml,
          location,
          current_comp_amount: currentCompAmount,
          current_comp_currency: currentCompCurrency,
          current_comp_frequency: currentCompFrequency,
          is_active_match: isActiveMatch,
          match_is_active: matchIsActive,
          submitted_at: submittedAt,
          dropped_at: droppedAt,
          raw_match_json: match,
          raw_candidate_json: candidate,
          last_synced_at: new Date().toISOString(),
        },
      };
    },
  );

  const upsertRows = enriched
    .filter((r): r is { kind: "upsert"; row: Record<string, unknown> } =>
      r !== null && r.kind === "upsert",
    )
    .map((r) => r.row);
  const preservedPatches = enriched
    .filter((r): r is { kind: "preserve"; patch: PreservePatch } =>
      r !== null && r.kind === "preserve",
    )
    .map((r) => r.patch);

  // Mark every row inactive first; the upsert and preserve passes below will
  // re-activate the ones that still belong in the active pipeline view.
  await supabase
    .from("candidate_cache")
    .update({ is_active_match: false })
    .eq("manatal_job_id", jobId);

  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from("candidate_cache")
      .upsert(upsertRows, { onConflict: "manatal_job_id,manatal_match_id" });
    if (error) throw error;
  }

  // For rows we preserved (detail fetch failed but existing row had good
  // data), update the match-level fields we already have from listJobMatches.
  // Loop because each match has its own derived is_active_match.
  if (preservedPatches.length > 0) {
    const now = new Date().toISOString();
    for (const p of preservedPatches) {
      const { error } = await supabase
        .from("candidate_cache")
        .update({
          is_active_match: p.is_active_match,
          match_is_active: p.match_is_active,
          submitted_at: p.submitted_at,
          dropped_at: p.dropped_at,
          raw_match_json: p.raw_match_json,
          last_synced_at: now,
        })
        .eq("manatal_job_id", jobId)
        .eq("manatal_match_id", p.matchId);
      if (error) throw error;
    }
  }

  const { data, error } = await supabase
    .from("candidate_cache")
    .select("*")
    .eq("manatal_job_id", jobId)
    .eq("is_active_match", true)
    .order("stage_rank", { ascending: false, nullsFirst: false })
    .order("candidate_full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CandidateCacheRow[];
}

function resolveCandidateId(match: ManatalMatch): number | null {
  if (typeof match.candidate === "number") return match.candidate;
  if (match.candidate && typeof match.candidate === "object" && match.candidate.id) {
    return match.candidate.id;
  }
  return null;
}

async function mapInWaves<T, R>(
  items: T[],
  waveSize: number,
  gapMs: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += waveSize) {
    const wave = items.slice(i, i + waveSize);
    const waveResults = await Promise.all(wave.map(fn));
    results.push(...waveResults);
    if (i + waveSize < items.length) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }
  return results;
}
