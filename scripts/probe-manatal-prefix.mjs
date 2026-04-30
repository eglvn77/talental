// Diagnostic only — not part of production runtime.
// Run with: node scripts/probe-manatal-prefix.mjs
// Sanity-checks whether a token value already includes the "Token " scheme
// prefix (it shouldn't). Manatal's own error messages distinguish "header
// scheme wrong" from "value wrong" — this script surfaces both.

import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const raw = env.MANATAL_API_TOKEN; // e.g. "grn_..."
const URL = "https://api.manatal.com/open/v3/jobs/?page_size=1";

const variants = [
  // hypothesis: header should literally be "Token Token grn_..."
  { label: "Authorization: Token Token <raw>", value: `Token Token ${raw}` },
  // hypothesis: header should literally be "Token grn_..." with NO extra prefix
  // (i.e. user pasted "Token grn_..." into the env var, code shouldn't prepend)
  { label: "Authorization: Token <raw> (no double prefix)", value: `Token ${raw}` },
  // sanity: bare value, no scheme
  { label: "Authorization: <raw>", value: raw },
  // sanity: maybe Manatal wants Bearer with the grn_ prefix retained
  { label: "Authorization: Bearer Token <raw>", value: `Bearer Token ${raw}` },
];

for (const v of variants) {
  const res = await fetch(URL, { headers: { Authorization: v.value } });
  const text = (await res.text()).slice(0, 200);
  console.log(`[${v.label}] -> ${res.status} ${text}`);
}
