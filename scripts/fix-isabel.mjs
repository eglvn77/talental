// Diagnostic only — single-shot fetch of Isabel's candidate detail with
// retry-on-429, then upsert just the fields that need patching.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const T = env.MANATAL_API_TOKEN;
const ID = 147566811;

async function fetchCandidateWithRetry() {
  for (let attempt = 1; attempt <= 12; attempt++) {
    const r = await fetch(`https://api.manatal.com/open/v3/candidates/${ID}/`, {
      headers: { Authorization: `Token ${T}` },
    });
    if (r.status === 200) return await r.json();
    const text = await r.text();
    console.log(`  attempt ${attempt}: ${r.status} ${text.slice(0, 100)}`);
    if (r.status === 429) {
      // Manatal "Expected available in N seconds." — parse N if available
      const match = /Expected available in (\d+) seconds?/.exec(text);
      const wait = match ? Number(match[1]) * 1000 + 500 : 15000;
      console.log(`  waiting ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    } else {
      throw new Error(`Unexpected ${r.status}`);
    }
  }
  throw new Error("Out of retries");
}

console.log("Fetching Isabel's candidate detail with retry...");
const c = await fetchCandidateWithRetry();
console.log(`Got it. full_name=${c.full_name}, has_resume=${Boolean(c.resume)}`);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await sb
  .from("candidate_cache")
  .update({
    candidate_full_name: c.full_name,
    email: c.email ?? null,
    current_company: c.current_company ?? null,
    current_position: c.current_position ?? null,
    description: c.description ?? null,
    has_resume: Boolean(c.resume && typeof c.resume === "string" && c.resume.trim()),
    candidate_report_html:
      typeof c.custom_fields?.candidatereport === "string"
        ? c.custom_fields.candidatereport
        : null,
    is_active_match: true,
    last_synced_at: new Date().toISOString(),
  })
  .eq("manatal_job_id", 3826949)
  .eq("manatal_candidate_id", ID);

if (error) {
  console.error("update error:", error);
  process.exit(1);
}
console.log("Updated Isabel's cache row.");
