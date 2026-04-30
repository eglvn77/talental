// Diagnostic only — not part of production runtime.
// Run with: node scripts/probe-manatal-resume-shape.mjs
// We've established that /candidates/{id}/resume/ returns 404 for every sampled
// candidate. This script casts a wider net: dumps custom_fields, tries
// alternative URL shapes, and looks for any field on the candidate that might
// indicate a resume.

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

// Pick one Alertyx candidate
const id = 147785905;

console.log("=== Full candidate detail ===");
const detail = await fj(`/candidates/${id}/`);
console.log(JSON.stringify(detail.body, null, 2));

console.log("\n=== Alternate URL shapes ===");
const shapes = [
  `/candidates/${id}/resume/`,
  `/candidates/${id}/cv/`,
  `/candidates/${id}/files/`,
  `/candidates/${id}/files/resume/`,
  `/candidates/${id}/?expand=resume`,
  `/candidates/${id}/?include=resume`,
  `/candidates/${id}/documents/`,
  `/resumes/?candidate=${id}`,
];
for (const s of shapes) {
  const r = await fj(s);
  let snip = "";
  if (r.status === 200 && typeof r.body === "object") {
    const keys = Array.isArray(r.body) ? `[${r.body.length} items]` : Object.keys(r.body).slice(0, 8).join(",");
    snip = keys;
  } else if (typeof r.body === "object" && "detail" in (r.body ?? {})) {
    snip = r.body.detail;
  }
  console.log(`  ${s} -> ${r.status} ${snip}`);
}
