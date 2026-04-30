// Diagnostic only — populates Isabel's row in candidate_cache directly so
// the SGD demo portal can render without firing a 97-req refresh. Uses one
// social-media call to fetch her LinkedIn, then upserts.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const T = env.MANATAL_API_TOKEN;
const BASE = "https://api.manatal.com/open/v3";
const H = { Authorization: `Token ${T}`, Accept: "application/json" };

async function fj(path) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

const ISABEL_CANDIDATE_ID = 147566811;
const SGD_JOB_ID = 3826949;

console.log("Fetching Isabel's match in SGD...");
const matches = await fj(`/matches/?candidate=${ISABEL_CANDIDATE_ID}&job=${SGD_JOB_ID}&page_size=10`);
let myMatch = (matches.body?.results ?? []).find((m) => m.job === SGD_JOB_ID && m.candidate === ISABEL_CANDIDATE_ID);
if (!myMatch) {
  console.log("Falling back: /jobs/{id}/matches/ filtered locally");
  const list = await fj(`/jobs/${SGD_JOB_ID}/matches/?page_size=100&is_active=true`);
  myMatch = (list.body?.results ?? []).find((m) => {
    const cid = typeof m.candidate === "number" ? m.candidate : m.candidate?.id;
    return cid === ISABEL_CANDIDATE_ID;
  });
}
if (!myMatch) {
  console.error("Could not find Isabel's match");
  process.exit(1);
}
console.log(`Match: ${myMatch.id} stage="${myMatch.stage?.name}"`);

console.log("Fetching candidate detail + social-media + attachments...");
const [det, sm, att] = await Promise.all([
  fj(`/candidates/${ISABEL_CANDIDATE_ID}/`),
  fj(`/candidates/${ISABEL_CANDIDATE_ID}/social-media/`),
  fj(`/candidates/${ISABEL_CANDIDATE_ID}/attachments/`),
]);
console.log("statuses:", { det: det.status, sm: sm.status, att: att.status });

const candidate = det.body;
const social = Array.isArray(sm.body) ? sm.body : sm.body?.results ?? [];
const attachments = Array.isArray(att.body) ? att.body : att.body?.results ?? [];

const linkedinEntry = social.find(
  (e) => (e.social_media_slug ?? "").toLowerCase() === "linkedin",
);
const linkedinUrl =
  linkedinEntry?.social_media_url ||
  linkedinEntry?.social_media_data?.url ||
  null;

const hasResume = Boolean(typeof candidate?.resume === "string" && candidate.resume.trim());
const reportHtml =
  typeof candidate?.custom_fields?.candidatereport === "string"
    ? candidate.custom_fields.candidatereport
    : null;

console.log("Extracted:");
console.log("  linkedin_url:", linkedinUrl);
console.log("  has_resume:", hasResume);
console.log("  attachment_count:", attachments.length);
console.log("  candidate_report_html length:", reportHtml?.length);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Upsert; preserve existing slug if present
const existing = await sb
  .from("candidate_cache")
  .select("candidate_slug")
  .eq("manatal_job_id", SGD_JOB_ID)
  .eq("manatal_match_id", myMatch.id)
  .maybeSingle();
const slug = existing.data?.candidate_slug ?? Math.random().toString(36).slice(2, 14);

const { error } = await sb.from("candidate_cache").upsert(
  {
    manatal_job_id: SGD_JOB_ID,
    manatal_match_id: myMatch.id,
    manatal_candidate_id: ISABEL_CANDIDATE_ID,
    candidate_slug: slug,
    candidate_full_name: candidate.full_name,
    stage_name: myMatch.stage?.name ?? null,
    linkedin_url: linkedinUrl,
    has_resume: hasResume,
    attachment_count: attachments.length,
    email: candidate.email ?? null,
    current_company: candidate.current_company ?? null,
    current_position: candidate.current_position ?? null,
    description: candidate.description ?? null,
    candidate_report_html: reportHtml,
    is_active_match: true,
    raw_match_json: myMatch,
    raw_candidate_json: candidate,
    last_synced_at: new Date().toISOString(),
  },
  { onConflict: "manatal_job_id,manatal_match_id" },
);
if (error) {
  console.error("upsert error:", error);
  process.exit(1);
}
console.log("Upserted Isabel's row. slug:", slug);
console.log(`Visit: http://localhost:3000/p/sgddemoportal/c/${slug}`);
