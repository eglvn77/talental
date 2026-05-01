// Diagnostic only — not part of production runtime.
// One-off backfill: re-fetches candidates with placeholder names ("Candidate <id>")
// from Manatal sequentially with rate-limit-aware retries, and updates the
// existing candidate_cache row in place.

import { readFileSync } from "node:fs";

// Load .env.local before importing anything that reads env vars.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
const {
  getCandidate,
  getCandidateSocialMedia,
  getCandidateAttachments,
  extractLinkedinUrl,
  extractLocation,
  extractCurrentComp,
  extractCurrencyAndFrequency,
} = await import("@/lib/manatal");
const { getSupabaseAdmin } = await import("@/lib/supabase");

const REPORT_CUSTOM_FIELD_KEY = "candidatereport";
const SLEEP_BEFORE_REQ_MS = 2_000;
const RETRY_SLEEP_MS = 30_000;
const MAX_RETRIES = 3;

const supabase = getSupabaseAdmin();

const { data: rows, error } = await supabase
  .from("candidate_cache")
  .select("id, manatal_job_id, manatal_candidate_id, candidate_full_name")
  .eq("is_active_match", true)
  .like("candidate_full_name", "Candidate %")
  .order("manatal_job_id", { ascending: true })
  .order("manatal_candidate_id", { ascending: true });

if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}

const targets = rows ?? [];
console.log(`Found ${targets.length} placeholder rows to backfill\n`);

let processed = 0;
let updated = 0;
let skipped404 = 0;
let failed = 0;

function is429(err: unknown): boolean {
  return err instanceof Error && /\b429\b/.test(err.message);
}
function is404(err: unknown): boolean {
  return err instanceof Error && /\b404\b/.test(err.message);
}

async function fetchWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (is429(err) && attempt < MAX_RETRIES) {
        attempt++;
        console.log(`  429 — sleeping ${RETRY_SLEEP_MS / 1000}s (retry ${attempt}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, RETRY_SLEEP_MS));
        continue;
      }
      throw err;
    }
  }
}

for (const row of targets) {
  processed++;
  const id = row.manatal_candidate_id;
  const jobId = row.manatal_job_id;

  await new Promise((r) => setTimeout(r, SLEEP_BEFORE_REQ_MS));

  let candidate: Awaited<ReturnType<typeof getCandidate>> | null;
  let social: Awaited<ReturnType<typeof getCandidateSocialMedia>> | null = null;
  let attachments: Awaited<ReturnType<typeof getCandidateAttachments>> = [];
  try {
    candidate = await fetchWithRetry(() => getCandidate(id));
  } catch (err) {
    if (is404(err)) {
      skipped404++;
      console.log(`[${processed}/${targets.length}] SKIP 404 id=${id} job=${jobId}`);
      continue;
    }
    failed++;
    const msg = err instanceof Error ? err.message.slice(0, 100) : String(err).slice(0, 100);
    console.log(`[${processed}/${targets.length}] FAIL id=${id} job=${jobId}: ${msg}`);
    continue;
  }

  try {
    await new Promise((r) => setTimeout(r, SLEEP_BEFORE_REQ_MS));
    social = await fetchWithRetry(() => getCandidateSocialMedia(id));
  } catch {
    social = null;
  }
  try {
    await new Promise((r) => setTimeout(r, SLEEP_BEFORE_REQ_MS));
    attachments = await fetchWithRetry(() => getCandidateAttachments(id));
  } catch {
    attachments = [];
  }

  const fullName =
    candidate?.full_name?.trim() ||
    `Candidate ${id}`;
  const linkedin = extractLinkedinUrl(social ?? null, candidate ?? null);
  const hasResume = Boolean(
    candidate?.resume && typeof candidate.resume === "string" && candidate.resume.trim(),
  );
  const cf = candidate?.custom_fields;
  const reportRaw =
    cf && typeof cf === "object" && REPORT_CUSTOM_FIELD_KEY in cf
      ? (cf as Record<string, unknown>)[REPORT_CUSTOM_FIELD_KEY]
      : null;
  const candidateReportHtml =
    typeof reportRaw === "string" && reportRaw.trim().length > 0 ? reportRaw : null;
  const location = extractLocation(candidate ?? null);
  const currentCompAmount = extractCurrentComp(candidate ?? null);
  const { currency: currentCompCurrency, frequency: currentCompFrequency } =
    extractCurrencyAndFrequency(candidate ?? null);

  const update = {
    candidate_full_name: fullName,
    linkedin_url: linkedin,
    has_resume: hasResume,
    attachment_count: (attachments ?? []).length,
    email: typeof candidate?.email === "string" ? candidate.email : null,
    current_company:
      typeof candidate?.current_company === "string" ? candidate.current_company : null,
    current_position:
      typeof candidate?.current_position === "string" ? candidate.current_position : null,
    description:
      typeof candidate?.description === "string" ? candidate.description : null,
    candidate_report_html: candidateReportHtml,
    location,
    current_comp_amount: currentCompAmount,
    current_comp_currency: currentCompCurrency,
    current_comp_frequency: currentCompFrequency,
    raw_candidate_json: candidate ?? null,
    last_synced_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("candidate_cache")
    .update(update)
    .eq("id", row.id);

  if (upErr) {
    failed++;
    console.log(`[${processed}/${targets.length}] DB FAIL id=${id} job=${jobId}: ${upErr.message.slice(0, 100)}`);
    continue;
  }
  updated++;
  if (processed % 10 === 0 || processed === targets.length) {
    console.log(`[${processed}/${targets.length}] Updated ${fullName} (id=${id}, job=${jobId})`);
  }
}

console.log(`\n--- Summary ---`);
console.log(`Total processed: ${processed}`);
console.log(`Updated:         ${updated}`);
console.log(`Skipped (404):   ${skipped404}`);
console.log(`Failed:          ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
