// Diagnostic only — not part of production runtime.
// Run with: node scripts/probe-manatal-resume.mjs
// Probes /candidates/{id}/resume/ across all Alertyx-job candidates AND a
// broader sample from /candidates/ to find at least one with a resume, so we
// can confirm the 200-vs-404 shape and decide whether our has_resume probe is
// reading the right field.

import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const T = env.MANATAL_API_TOKEN;
const BASE = "https://api.manatal.com/open/v3";
const H = { Authorization: `Token ${T}`, Accept: "application/json" };

async function fetchJson(path) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  let body = null;
  try {
    body = await r.json();
  } catch {
    body = await r.text();
  }
  return { status: r.status, body };
}

console.log("=== Step 1: list a broader candidate sample ===");
const list = await fetchJson("/candidates/?page_size=20");
console.log("status:", list.status, "count:", list.body?.count, "len:", list.body?.results?.length);

const ids = (list.body?.results ?? []).map((c) => c.id).slice(0, 20);
console.log("probing ids:", ids);

console.log("\n=== Step 2: hit /candidates/{id}/resume/ for each ===");
const results = [];
for (const id of ids) {
  const r = await fetchJson(`/candidates/${id}/resume/`);
  let snippet = "";
  if (r.status === 200) {
    snippet = JSON.stringify(r.body).slice(0, 200);
  } else if (typeof r.body === "object" && r.body && "detail" in r.body) {
    snippet = JSON.stringify(r.body);
  }
  console.log(`  candidate ${id} -> ${r.status} ${snippet}`);
  results.push({ id, status: r.status, body: r.body });
}

const with200 = results.filter((r) => r.status === 200);
console.log(`\n=== Summary: ${with200.length}/${results.length} returned 200 ===`);
if (with200.length > 0) {
  console.log("First 200 response shape:");
  console.log(JSON.stringify(with200[0].body, null, 2));
}
