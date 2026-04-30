// Search for Isabel directly via /candidates/?search= and dump her full
// candidate detail + the match.custom_fields for her job.

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

console.log("Searching candidates for 'isabel'...");
const search = await fj("/candidates/?search=isabel&page_size=20");
console.log(`status=${search.status} count=${search.body?.count}`);
const matchingByName = (search.body?.results ?? []).filter((c) =>
  /isabel/i.test(c.full_name ?? ""),
);
console.log(`results matching 'isabel' in name: ${matchingByName.length}`);
for (const c of matchingByName) {
  console.log(`  ${c.id}  ${c.full_name}`);
}

const isabel = matchingByName.find((c) => /gut/i.test(c.full_name ?? ""));
if (!isabel) {
  console.log("\nNo Gutierrez among results; broadening search...");
  const s2 = await fj("/candidates/?search=gutierrez&page_size=20");
  for (const c of s2.body?.results ?? []) {
    if (/isabel/i.test(c.full_name ?? "")) console.log(`  ${c.id}  ${c.full_name}`);
  }
  process.exit(0);
}
console.log(`\nFound: ${isabel.full_name} (id ${isabel.id})`);

console.log("\n=== Full candidate detail ===");
console.log(JSON.stringify(isabel, null, 2).slice(0, 3000));

console.log("\n=== Custom fields keys + lengths (candidate level) ===");
const cf = isabel.custom_fields;
if (cf && Object.keys(cf).length > 0) {
  for (const [k, v] of Object.entries(cf)) {
    const valStr = typeof v === "string" ? v : JSON.stringify(v);
    console.log(`  '${k}'  type=${typeof v} len=${valStr?.length ?? 0}`);
    if (valStr && valStr.length > 0 && valStr.length < 600) {
      console.log(`    value: ${valStr.slice(0, 600).replace(/\n/g, "\\n")}`);
    } else if (valStr && valStr.length >= 600) {
      console.log(`    value (first 600 chars): ${valStr.slice(0, 600).replace(/\n/g, "\\n")}…`);
    }
  }
} else {
  console.log("  (empty)");
}

// Also probe matches for this candidate to find the Sr Growth Director match
// and dump match.custom_fields (the report might live on the match instead).
console.log("\n=== Matches for Isabel — checking match.custom_fields ===");
const targetJobId = 3826949;
const matches = await fj(`/jobs/${targetJobId}/matches/?page_size=100&is_active=false`);
const myMatch = (matches.body?.results ?? []).find((m) => m.candidate === isabel.id);
if (!myMatch) {
  console.log(`  No match for candidate ${isabel.id} in job ${targetJobId} (active=false)`);
} else {
  console.log(`  Match ${myMatch.id} stage: "${myMatch.stage?.name}" is_active=${myMatch.is_active}`);
  const mcf = myMatch.custom_fields;
  if (mcf && Object.keys(mcf).length > 0) {
    console.log("  match.custom_fields:");
    for (const [k, v] of Object.entries(mcf)) {
      const valStr = typeof v === "string" ? v : JSON.stringify(v);
      console.log(`    '${k}' type=${typeof v} len=${valStr?.length ?? 0}`);
      if (valStr && valStr.length > 0) {
        console.log(`      value (first 600 chars): ${valStr.slice(0, 600).replace(/\n/g, "\\n")}${valStr.length > 600 ? "…" : ""}`);
      }
    }
  } else {
    console.log("  match.custom_fields: (empty)");
  }
}
