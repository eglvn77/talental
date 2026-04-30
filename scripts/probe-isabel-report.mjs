// Diagnostic only — find Isabel Gutierrez under the Sr Growth Director job
// and dump her candidate detail (especially custom_fields) so we can identify
// the report key.

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

// Sr Growth Director = job 3826949 (confirmed from /jobs/ list)
const target = { id: 3826949, position_name: "Sr Growth Director" };
console.log(`Job: ${target.id}  "${target.position_name}"`);

const matches = await fj(`/jobs/${target.id}/matches/?page_size=100&is_active=true`);
const ms = matches.body?.results ?? [];
console.log(`Total matches: ${ms.length}`);
console.log("First match keys:", ms[0] ? Object.keys(ms[0]) : "none");
console.log("First match sample:", JSON.stringify(ms[0]).slice(0, 400));

// Walk candidate detail to find Isabel by name. 32 candidates — paced 1/sec to
// stay under the rate limit while shared with other flows.
let found = null;
for (const m of ms) {
  const cid = typeof m.candidate === "number" ? m.candidate : m.candidate?.id;
  if (!cid) continue;
  const det = await fj(`/candidates/${cid}/`);
  if (det.status === 200 && /isabel/i.test(det.body?.full_name ?? "") && /gut/i.test(det.body?.full_name ?? "")) {
    found = { match: m, candidate: det.body, cid };
    break;
  }
  await new Promise((r) => setTimeout(r, 600));
}
if (!found) {
  console.log("Did not find Isabel Gutierrez in any of the 32 candidates");
  process.exit(0);
}
const { match: m, candidate, cid } = found;
console.log(`\nFound: ${candidate.full_name} (id ${cid}), match ${m.id}, stage "${m.stage?.name}"`);

const detail = { body: candidate };
console.log(`\nFull candidate detail:`);
console.log(JSON.stringify(detail.body, null, 2));

const cf = detail.body?.custom_fields;
if (cf && Object.keys(cf).length > 0) {
  console.log("\n=== custom_fields keys + value lengths ===");
  for (const [k, v] of Object.entries(cf)) {
    const valStr = typeof v === "string" ? v : JSON.stringify(v);
    const len = valStr?.length ?? 0;
    console.log(`  ${k} (${typeof v}, len=${len})`);
  }
}
