// Diagnostic only — not part of production runtime.
// Run with: node scripts/probe-manatal-attachments.mjs
// Hits /candidates/{id}/attachments/ for a sample of candidates to see if
// resumes are stored as attachments instead of behind /resume/.

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

const list = await fetchJson("/candidates/?page_size=20");
const ids = (list.body?.results ?? []).map((c) => c.id).slice(0, 20);

console.log("Probing /candidates/{id}/attachments/ for 20 candidates:\n");
let foundAny = false;
let foundResume = null;
for (const id of ids) {
  const r = await fetchJson(`/candidates/${id}/attachments/`);
  const items = Array.isArray(r.body) ? r.body : r.body?.results;
  const len = items?.length ?? 0;
  if (len > 0) {
    foundAny = true;
    const types = items.map((a) => `${a.type ?? "?"}/${a.name ?? a.file_name ?? "?"}`).join(", ");
    console.log(`  ${id} -> ${r.status} (${len} items): ${types}`);
    if (!foundResume) {
      foundResume = { id, attachments: items };
    }
  } else {
    console.log(`  ${id} -> ${r.status} (empty)`);
  }
}

if (foundResume) {
  console.log("\n=== First non-empty attachment list, full shape ===");
  console.log(JSON.stringify(foundResume.attachments, null, 2).slice(0, 2000));
} else {
  console.log("\n=== NO candidates in this 20-sample have any attachments ===");
}

// Also try the candidate detail itself to see if resume info lives there
console.log("\n=== Candidate detail full shape (first id) ===");
const detail = await fetchJson(`/candidates/${ids[0]}/`);
console.log("status:", detail.status);
const keys = detail.body && typeof detail.body === "object" ? Object.keys(detail.body) : [];
console.log("keys:", keys.join(", "));
const interesting = keys.filter((k) => /resume|cv|file|attach/i.test(k));
console.log("resume-ish keys:", interesting);
for (const k of interesting) {
  console.log(`  ${k} = ${JSON.stringify(detail.body[k])?.slice(0, 200)}`);
}
