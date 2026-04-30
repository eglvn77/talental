// Diagnostic only — not part of production runtime.
// Run with: node scripts/probe-manatal-experiences-educations.mjs
// Probes /candidates/{id}/experiences/ and /candidates/{id}/educations/ to
// confirm response shape (array vs {results}) and per-item fields, so we know
// what to display on the deep-link page.

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
  [147785867, "Eric Lira"],
  [147785945, "Jesus Nieto"],
];

for (const [id, name] of ids) {
  const [exps, edus] = await Promise.all([
    fj(`/candidates/${id}/experiences/`),
    fj(`/candidates/${id}/educations/`),
  ]);
  console.log(`\n=== ${id} ${name} ===`);
  console.log(`/experiences/ -> ${exps.status}`);
  console.log("  body shape:", Array.isArray(exps.body) ? `array(${exps.body.length})` : (typeof exps.body === "object" && exps.body && "results" in exps.body ? `paged(${exps.body.results?.length})` : "other"));
  const exp1 = Array.isArray(exps.body) ? exps.body[0] : exps.body?.results?.[0];
  if (exp1) console.log("  first item keys:", Object.keys(exp1).join(","));
  if (exp1) console.log("  first item sample:", JSON.stringify(exp1).slice(0, 400));

  console.log(`/educations/ -> ${edus.status}`);
  console.log("  body shape:", Array.isArray(edus.body) ? `array(${edus.body.length})` : (typeof edus.body === "object" && edus.body && "results" in edus.body ? `paged(${edus.body.results?.length})` : "other"));
  const edu1 = Array.isArray(edus.body) ? edus.body[0] : edus.body?.results?.[0];
  if (edu1) console.log("  first item keys:", Object.keys(edu1).join(","));
  if (edu1) console.log("  first item sample:", JSON.stringify(edu1).slice(0, 400));
}
