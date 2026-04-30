// Diagnostic only — full dump of candidate 147566811 + every sub-resource
// I can think of, looking for the "report" field.

import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const T = env.MANATAL_API_TOKEN;
const BASE = "https://api.manatal.com/open/v3";
const H = { Authorization: `Token ${T}`, Accept: "application/json" };
const ID = 147566811;

async function fj(path) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

async function dump(label, path) {
  await new Promise((r) => setTimeout(r, 700));
  const r = await fj(path);
  console.log(`\n=== ${label}  ${path} ===`);
  console.log(`status: ${r.status}`);
  if (r.status === 429) {
    console.log("  rate-limited; will skip");
    return null;
  }
  const s = JSON.stringify(r.body, null, 2);
  console.log(s.length > 2000 ? s.slice(0, 2000) + "\n…(truncated)…" : s);
  return r.body;
}

await dump("candidate detail", `/candidates/${ID}/`);
await dump("with expand", `/candidates/${ID}/?expand=custom_fields,reports,assessments`);
await dump("notes", `/candidates/${ID}/notes/`);
await dump("comments", `/candidates/${ID}/comments/`);
await dump("assessments", `/candidates/${ID}/assessments/`);
await dump("reports", `/candidates/${ID}/reports/`);
await dump("activities", `/candidates/${ID}/activities/`);
await dump("interviews", `/candidates/${ID}/interviews/`);
await dump("scorecards", `/candidates/${ID}/scorecards/`);
await dump("evaluations", `/candidates/${ID}/evaluations/`);
await dump("attachments", `/candidates/${ID}/attachments/`);
await dump("matches for this candidate", `/matches/?candidate=${ID}&page_size=10`);
