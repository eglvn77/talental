// Diagnostic only — not part of production runtime.
// Run with: node scripts/probe-manatal-linkedin.mjs
// For each Alertyx candidate, dumps the full /social-media/ response and the
// candidate.custom_fields, so we can see exactly where (if anywhere) the
// LinkedIn URL is stored.

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

const ids = [
  [147785905, "Alexis Torres"],
  [147785938, "Azalea Macedo"],
  [147785922, "Carmen Villanueva"],
  [147785856, "Cesar Paulin"],
  [147785956, "Daniel Toledano"],
  [147785883, "Eliot Martinez"],
  [147785867, "Eric Lira"],
  [147785945, "Jesus Nieto"],
  [147785929, "Juan Sánchez"],
  [147785913, "Maria Martínez"],
];

for (const [id, name] of ids) {
  const [sm, det] = await Promise.all([
    fj(`/candidates/${id}/social-media/`),
    fj(`/candidates/${id}/`),
  ]);
  console.log(`\n=== ${id} ${name} ===`);
  console.log(`/social-media/ -> ${sm.status}`);
  console.log("  body:", JSON.stringify(sm.body));
  const cf = det.body?.custom_fields ?? null;
  console.log("  custom_fields:", JSON.stringify(cf));
}
