// Diagnostic only — not part of production runtime.
// Run with: node scripts/probe-manatal-report-key.mjs
// Walks every Manatal job, finds matches at stage "Sent to Client" (or any
// stage whose name contains "client"), fetches the candidate detail, and
// reports the custom_fields keys + a small value sample so we can identify
// which key holds the report HTML.

import { readFileSync } from "node:fs";

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

async function paginated(initial) {
  const all = [];
  let path = initial;
  while (path) {
    const r = await fj(path);
    if (r.status !== 200) {
      console.error(`  ${path} -> ${r.status}`);
      break;
    }
    all.push(...(r.body.results ?? []));
    if (r.body.next) {
      const u = new URL(r.body.next);
      path = `${u.pathname.replace("/open/v3", "")}${u.search}`;
    } else {
      path = null;
    }
  }
  return all;
}

console.log("Listing jobs...");
const jobs = await paginated("/jobs/?page_size=100");
console.log(`  Got ${jobs.length} jobs`);

const candidatesAtClientStage = [];
for (const job of jobs) {
  const matches = await paginated(
    `/jobs/${job.id}/matches/?page_size=100&is_active=true`,
  );
  const filtered = matches.filter((m) => /client/i.test(m.stage?.name ?? ""));
  if (filtered.length > 0) {
    console.log(
      `  Job ${job.id} "${job.position_name}": ${filtered.length} candidates at client-related stages`,
    );
    for (const m of filtered) {
      const cid = typeof m.candidate === "number" ? m.candidate : m.candidate?.id;
      if (cid) candidatesAtClientStage.push({ job, match: m, candidateId: cid });
    }
  }
}

console.log(
  `\nTotal client-stage candidates found: ${candidatesAtClientStage.length}`,
);
if (candidatesAtClientStage.length === 0) {
  console.log(
    "No candidates at any 'client' stage. Falling back to a broad sample of candidates with non-empty custom_fields.",
  );
  const list = await fj("/candidates/?page_size=50");
  for (const c of list.body?.results ?? []) {
    const detail = await fj(`/candidates/${c.id}/`);
    const cf = detail.body?.custom_fields;
    if (cf && Object.keys(cf).length > 0) {
      console.log(`\n=== ${c.id} ${c.full_name} (no client-stage match) ===`);
      console.log("  stage: (no match info)");
      console.log("  custom_fields keys:", Object.keys(cf));
      for (const [k, v] of Object.entries(cf)) {
        const valStr = typeof v === "string" ? v : JSON.stringify(v);
        console.log(`    ${k} (${typeof v}, len=${valStr?.length ?? 0}): ${(valStr ?? "").slice(0, 200)}`);
      }
      break;
    }
  }
} else {
  // Probe up to 3 of them to confirm consistency of the key naming
  for (const { job, match, candidateId } of candidatesAtClientStage.slice(0, 3)) {
    const detail = await fj(`/candidates/${candidateId}/`);
    console.log(
      `\n=== Candidate ${candidateId} "${detail.body?.full_name}" — job "${job.position_name}", stage "${match.stage?.name}" ===`,
    );
    const cf = detail.body?.custom_fields;
    if (!cf || Object.keys(cf).length === 0) {
      console.log("  custom_fields: (empty)");
      continue;
    }
    console.log("  custom_fields keys:", Object.keys(cf));
    for (const [k, v] of Object.entries(cf)) {
      const valStr = typeof v === "string" ? v : JSON.stringify(v);
      const len = valStr?.length ?? 0;
      const preview = (valStr ?? "").slice(0, 300).replace(/\n/g, "\\n");
      console.log(`    ${k} (${typeof v}, len=${len}): ${preview}${len > 300 ? "…" : ""}`);
    }
  }
}
