// Diagnostic only — not part of production runtime.
// Run with: node scripts/probe-manatal-jobs.mjs
// Hits Manatal's /jobs/ endpoint with a few different filter shapes and prints
// status, count, and a sample of the first result so you can see what the
// real response looks like (vs. what our types assume).

import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const token = env.MANATAL_API_TOKEN;
const BASE = "https://api.manatal.com/open/v3";

async function probe(label, path) {
  const url = `${BASE}${path}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Authorization: `Token ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 500);
  }
  const dur = Date.now() - t0;
  const summary = {
    status: res.status,
    duration_ms: dur,
    count: body?.count,
    results_len: Array.isArray(body?.results) ? body.results.length : undefined,
    keys_on_first: body?.results?.[0] ? Object.keys(body.results[0]) : undefined,
    first_sample:
      body?.results?.[0]
        ? {
            id: body.results[0].id,
            position_name: body.results[0].position_name,
            status: body.results[0].status,
            organization: body.results[0].organization,
            is_active: body.results[0].is_active,
          }
        : undefined,
  };
  console.log(`\n=== ${label} ===`);
  console.log("URL:", url);
  console.log(JSON.stringify(summary, null, 2));
  if (res.status >= 400) console.log("ERROR BODY:", typeof body === "string" ? body : JSON.stringify(body).slice(0, 500));
}

await probe("baseline /jobs/ (no params)", "/jobs/");
await probe("/jobs/?page_size=50", "/jobs/?page_size=50");
await probe("/jobs/?page_size=50&search=canva", "/jobs/?page_size=50&search=canva");
await probe("/jobs/?status=active", "/jobs/?status=active");
await probe("/jobs/?position_name__icontains=canva", "/jobs/?position_name__icontains=canva");
await probe("/jobs/?position_name=Sr.%20Media%20Manager%20Brazil", "/jobs/?position_name=Sr.%20Media%20Manager%20Brazil");
