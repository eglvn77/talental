// Walk every match for the Sr Growth Director job. For each candidate, print
// id + full_name + stage + match.custom_fields keys + candidate.custom_fields
// keys (with truncated values). Paced to stay under rate limit.

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

const JOB = 3826949;
const matches = await fj(`/jobs/${JOB}/matches/?page_size=100&is_active=true`);
const ms = matches.body?.results ?? [];
console.log(`Sr Growth Director: ${ms.length} active matches\n`);

const summarize = (cf, label) => {
  if (!cf || Object.keys(cf).length === 0) return `${label}: empty`;
  const parts = [];
  for (const [k, v] of Object.entries(cf)) {
    const valStr = typeof v === "string" ? v : JSON.stringify(v);
    parts.push(`'${k}'(${typeof v},len=${valStr?.length ?? 0})`);
  }
  return `${label}: ${parts.join(", ")}`;
};

for (let i = 0; i < ms.length; i++) {
  const m = ms[i];
  const cid = typeof m.candidate === "number" ? m.candidate : m.candidate?.id;
  const det = await fj(`/candidates/${cid}/`);
  const name = det.body?.full_name ?? "??";
  const stage = m.stage?.name ?? "??";
  console.log(`[${i + 1}/${ms.length}] cand=${cid} match=${m.id} stage="${stage}" name="${name}"`);
  console.log(`        ${summarize(m.custom_fields, "match.cf")}`);
  console.log(`        ${summarize(det.body?.custom_fields, "candidate.cf")}`);
  await new Promise((r) => setTimeout(r, 700));
}
