// Diagnostic only — not part of production runtime.
// Run with: node scripts/test-supabase.mjs
// Verifies the service-role client can read tables and that anon (publishable)
// is correctly default-denied. Useful when debugging RLS / GRANT issues.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Load .env.local manually
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

console.log("URL:", env.NEXT_PUBLIC_SUPABASE_URL);
console.log("Service key prefix:", env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 12));

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error, status } = await sb.from("portal_links").select("id, slug").limit(1);
console.log("[service_role] status:", status, "error:", error?.message ?? null, "rows:", data?.length ?? 0);

// Now test that anon (publishable) is correctly blocked
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const a = await anon.from("portal_links").select("id, slug").limit(1);
console.log("[anon portal_links] status:", a.status, "error:", a.error?.message ?? null, "rows:", a.data?.length ?? 0);
const b = await anon.from("candidate_cache").select("id").limit(1);
console.log("[anon candidate_cache] status:", b.status, "error:", b.error?.message ?? null, "rows:", b.data?.length ?? 0);
const c = await anon.from("sync_log").select("id").limit(1);
console.log("[anon sync_log] status:", c.status, "error:", c.error?.message ?? null, "rows:", c.data?.length ?? 0);
