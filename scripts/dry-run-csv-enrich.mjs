#!/usr/bin/env node
/**
 * Dry-run for the Manatal CSV → Talental migration.
 *
 * Reads the CSV at CSV_PATH, picks the first N rows with a valid
 * LinkedIn URL, inserts them as candidates in this workspace, then
 * enriches each via DataForB2B /enrich/profile (1.5 cr per call).
 *
 * Required env (one of: .env.local, or `export VAR=...` in your shell):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - DATAFOR_B2B_API_KEY
 *
 * Usage:
 *   node scripts/dry-run-csv-enrich.mjs
 *
 * Tunables (env or top of file):
 *   - CSV_PATH        — path to the CSV file
 *   - SAMPLE_SIZE     — how many candidates to import + enrich (default 10)
 *   - WORKSPACE_ID    — target workspace
 *   - SOURCE_ID       — candidate-source id to stamp on the rows
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---- Load env from .env.local if present (no dotenv dep required) ----
function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined && process.env[m[1]] !== "") continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadEnvFile(path.join(process.cwd(), ".env.local"));

// ---- Config ----
const CSV_PATH =
  process.env.CSV_PATH ||
  "/Users/eman/Downloads/Candidate Database Backup April 27, 2026 - manatal-import-combinado.csv.csv";
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE || 10);
const WORKSPACE_ID =
  process.env.WORKSPACE_ID || "d121441d-9dc8-4b4f-bd2c-bc6472635b69";
const SOURCE_ID =
  process.env.SOURCE_ID || "f32009f4-8d29-4a66-a625-6a30ffeb10d3"; // "Import"
const DFB2B_KEY = process.env.DATAFOR_B2B_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DFB2B_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATAFOR_B2B_API_KEY.",
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: "hiring" },
  auth: { persistSession: false },
});

// ---- Helpers ----
function canonicalizeLinkedinUrl(raw) {
  if (!raw) return null;
  let u = String(raw).trim();
  if (!u) return null;
  if (!u.startsWith("http")) u = "https://" + u;
  try {
    const url = new URL(u);
    if (!url.hostname.includes("linkedin.com")) return null;
    url.hostname = "www.linkedin.com";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}
function publicIdFromUrl(url) {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}
function clean(v) {
  const s = (v ?? "").trim();
  return s || null;
}
function normEmail(v) {
  const s = (v ?? "").trim().toLowerCase();
  return s.includes("@") ? s : null;
}

// ---- 1. Parse CSV ----
// Minimal CSV parser — handles quoted fields with commas, but the
// Manatal export is well-formed enough that this gets the job done.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c === "\r") {
        // ignore
      } else {
        cur += c;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}
const csvText = fs.readFileSync(CSV_PATH, "utf8");
const rows = parseCsv(csvText);
const header = rows.shift();
const idx = (name) => header.indexOf(name);
const COL = {
  name: idx("Candidate Name"),
  linkedin: idx("LinkedIn"),
  email: idx("Candidate Email Address"),
  phone: idx("Candidate Phone Number"),
  position: idx("Current Position"),
  company: idx("Current Company"),
  city: idx("City"),
  description: idx("Candidate Description"),
};
console.log(`CSV total rows: ${rows.length}`);

// ---- 2. Pick the first N with a valid LinkedIn URL ----
const candidates = [];
for (const r of rows) {
  const li = canonicalizeLinkedinUrl(r[COL.linkedin]);
  if (!li) continue;
  candidates.push({
    full_name: clean(r[COL.name]) ?? "Unnamed",
    linkedin_url: li,
    linkedin_public_id: publicIdFromUrl(li),
    email: normEmail(r[COL.email]),
    phone: clean(r[COL.phone]),
    current_position: clean(r[COL.position]),
    current_company_name: clean(r[COL.company]),
    city: clean(r[COL.city]),
    summary: clean(r[COL.description]),
  });
  if (candidates.length >= SAMPLE_SIZE) break;
}
console.log(`Picked ${candidates.length} candidates for dry-run.`);

// ---- 3. Insert raw rows (skip if email/linkedin already exists) ----
const inserted = [];
for (const c of candidates) {
  // Dedup check: skip if a row with same email OR same linkedin_url
  // already exists in this workspace (mirrors the partial-unique
  // indexes you already have in DB).
  let existing = null;
  if (c.email) {
    const { data } = await db
      .from("candidates")
      .select("id, full_name, email, linkedin_url, parsed_profile, enrichment_status")
      .eq("workspace_id", WORKSPACE_ID)
      .ilike("email", c.email)
      .is("linked_contact_id", null)
      .maybeSingle();
    if (data) existing = data;
  }
  if (!existing) {
    const { data } = await db
      .from("candidates")
      .select("id, full_name, email, linkedin_url, parsed_profile, enrichment_status")
      .eq("workspace_id", WORKSPACE_ID)
      .eq("linkedin_url", c.linkedin_url)
      .is("linked_contact_id", null)
      .maybeSingle();
    if (data) existing = data;
  }

  if (existing) {
    inserted.push({ ...existing, _existing: true, csv: c });
    console.log(`  skip insert (exists): ${c.full_name} (${existing.id})`);
    continue;
  }

  const { data, error } = await db
    .from("candidates")
    .insert({
      workspace_id: WORKSPACE_ID,
      source_id: SOURCE_ID,
      full_name: c.full_name,
      linkedin_url: c.linkedin_url,
      linkedin_public_id: c.linkedin_public_id,
      email: c.email,
      phone: c.phone,
      current_position: c.current_position,
      current_company_name: c.current_company_name,
      city: c.city,
      location: c.city,
      summary: c.summary,
    })
    .select("id, full_name, email, linkedin_url, parsed_profile, enrichment_status")
    .single();
  if (error) {
    console.error(`  insert FAILED for ${c.full_name}: ${error.message}`);
    continue;
  }
  inserted.push({ ...data, _existing: false, csv: c });
  console.log(`  inserted: ${c.full_name} (${data.id})`);
}

// ---- 4. Enrich via DfB2B ----
console.log("\nEnriching via DataForB2B /enrich/profile (1.5 cr each)…");
let creditsUsed = 0;
let notFound = 0;
let errors = 0;
const results = [];
for (const row of inserted) {
  const url = row.linkedin_url;
  const start = Date.now();
  let res;
  try {
    res = await fetch("https://api.dataforb2b.ai/enrich/profile", {
      method: "POST",
      headers: {
        api_key: DFB2B_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profile_identifier: url,
        enrich_profile: true,
        enrich_work_email: false,
        enrich_personal_email: false,
        enrich_phone: false,
      }),
    });
  } catch (e) {
    errors++;
    console.error(`  ERR ${row.full_name}: ${e.message}`);
    continue;
  }
  const ms = Date.now() - start;
  if (res.status === 404) {
    notFound++;
    await db
      .from("candidates")
      .update({
        enriched_at: new Date().toISOString(),
        enrichment_source: "dataforb2b",
        enrichment_status: "not_found",
      })
      .eq("id", row.id);
    console.log(`  not_found: ${row.full_name} (${ms}ms)`);
    continue;
  }
  if (!res.ok) {
    errors++;
    const detail = (await res.text()).slice(0, 200);
    console.error(`  HTTP ${res.status} ${row.full_name}: ${detail}`);
    continue;
  }
  const body = await res.json();
  creditsUsed += 1.5;
  const p = body?.profile ?? {};
  // Persist the headline fields + raw payload. Mirrors what
  // lib/sourcing/dataforb2b.ts does, simplified for the dry run.
  const patch = {
    parsed_profile: p,
    headline: p.headline ?? null,
    summary: p.summary ?? row.csv?.summary ?? null,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    current_position: p.current_position ?? row.csv?.current_position ?? null,
    current_company_name:
      p.current_company_name ?? row.csv?.current_company_name ?? null,
    profile_picture_url: p.profile_picture_url ?? null,
    country: p.country ?? null,
    city: p.city ?? row.csv?.city ?? null,
    years_of_experience:
      typeof p.years_of_experience === "number" ? p.years_of_experience : null,
    enriched_at: new Date().toISOString(),
    enrichment_source: "dataforb2b",
    enrichment_status: "ok",
  };
  const { error: updErr } = await db
    .from("candidates")
    .update(patch)
    .eq("id", row.id);
  if (updErr) {
    errors++;
    console.error(`  update FAILED for ${row.full_name}: ${updErr.message}`);
    continue;
  }
  results.push({ id: row.id, name: row.full_name, headline: p.headline, ms });
  console.log(
    `  ok: ${row.full_name} — "${(p.headline ?? "").slice(0, 60)}" (${ms}ms)`,
  );
}

// ---- 5. Summary ----
console.log("\n========== SUMMARY ==========");
console.log(`Inserted/found in DB: ${inserted.length}`);
console.log(`Enriched OK:          ${results.length}`);
console.log(`Not found in DfB2B:   ${notFound}`);
console.log(`Errors:               ${errors}`);
console.log(`Credits used:         ${creditsUsed.toFixed(1)} cr`);
console.log(
  `Avg ms/call:          ${results.length ? Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length) : 0}`,
);
console.log("\nIDs of inserted candidates (for review or rollback):");
for (const r of inserted) console.log(`  ${r.id}  ${r.full_name}`);
console.log("\nTo see them in the app: /candidates");
console.log(
  "To rollback (delete the dry-run rows): see the SQL printed below.\n",
);
console.log("-- Rollback SQL --");
console.log(
  `delete from hiring.candidates where id in (\n  '${inserted
    .filter((r) => !r._existing)
    .map((r) => r.id)
    .join("',\n  '")}'\n);`,
);
