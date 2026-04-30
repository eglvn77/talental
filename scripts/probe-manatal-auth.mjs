// Diagnostic only — not part of production runtime.
// Run with: node scripts/probe-manatal-auth.mjs
// Tries several Authorization header schemes (Token, Bearer, raw, apikey,
// X-API-Key) so you can tell whether a 401 is "wrong scheme" vs. "wrong value".

import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const token = env.MANATAL_API_TOKEN;
const URL = "https://api.manatal.com/open/v3/jobs/?page_size=1";

const variants = [
  { label: "Token <token>", headers: { Authorization: `Token ${token}` } },
  { label: "Bearer <token>", headers: { Authorization: `Bearer ${token}` } },
  { label: "raw <token>", headers: { Authorization: token } },
  { label: "apikey header", headers: { apikey: token } },
  { label: "X-API-Key header", headers: { "X-API-Key": token } },
];

for (const v of variants) {
  const res = await fetch(URL, { headers: v.headers });
  const text = (await res.text()).slice(0, 200);
  console.log(`[${v.label}] -> ${res.status} ${text}`);
}
