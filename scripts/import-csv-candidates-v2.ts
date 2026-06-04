/**
 * Direct importer using Supabase service-role client. Reads the CSV,
 * normalises, dedups against the live DB, bulk-inserts in batches.
 * Idempotent: re-running after an interrupt skips anything already
 * present (dedup by linkedin_url first, email second).
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";

const WORKSPACE_ID = "d121441d-9dc8-4b4f-bd2c-bc6472635b69";
const SOURCE_ID = "435f93f2-f48e-4295-af43-40996d01b642";
const CSV_PATH =
  "/Users/eman/Downloads/Candidate Database Backup April 27, 2026 - manatal-import-combinado.csv.csv";
const BATCH = 500;

type Row = {
  "Candidate Name": string;
  LinkedIn: string;
  "Candidate Email Address": string;
  "Candidate Phone Number": string;
  "Current Position": string;
  "Current Company": string;
  City: string;
  "Candidate Description": string;
};

function normLinkedIn(raw: string): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return t.toLowerCase().replace(/\/+$/, "");
  }
}

function normEmail(raw: string): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  return t.includes("@") ? t : null;
}

function asText(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t || null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient(url, key, {
    db: { schema: "hiring" },
    auth: { persistSession: false },
  });

  // Existing keys for dedup.
  console.log("📚 Loading existing keys from DB…");
  const existingLi = new Set<string>();
  const existingEmail = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("candidates")
      .select("linkedin_url, email")
      .eq("workspace_id", WORKSPACE_ID)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.linkedin_url) {
        const n = normLinkedIn(r.linkedin_url);
        if (n) existingLi.add(n);
      }
      if (r.email) {
        const n = normEmail(r.email);
        if (n) existingEmail.add(n);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`   ${existingLi.size} linkedin, ${existingEmail.size} emails`);

  // Parse CSV.
  console.log(`📂 Reading ${CSV_PATH}`);
  const parsed = Papa.parse<Row>(readFileSync(CSV_PATH, "utf8"), {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data;
  console.log(`   ${rows.length} CSV rows`);

  // Normalise + dedup.
  const seenLi = new Set<string>();
  const seenEmail = new Set<string>();
  let skippedNoKeys = 0, dupInCsv = 0, dupInDb = 0;
  const inserts: Array<{
    workspace_id: string;
    source_id: string;
    full_name: string;
    email: string | null;
    linkedin_url: string | null;
    phone: string | null;
    current_position: string | null;
    current_company_name: string | null;
    location: string | null;
    summary: string | null;
  }> = [];

  for (const r of rows) {
    const name = asText(r["Candidate Name"]);
    if (!name) { skippedNoKeys++; continue; }
    const li = normLinkedIn(r.LinkedIn ?? "");
    const email = normEmail(r["Candidate Email Address"] ?? "");
    if (!li && !email) { skippedNoKeys++; continue; }
    // Skip if EITHER key collides — DB has unique constraints on
    // BOTH (workspace_id, email) and (workspace_id, linkedin_url),
    // so we must check both even when one is "the primary key".
    if (li && (seenLi.has(li) || existingLi.has(li))) { dupInCsv++; continue; }
    if (email && (seenEmail.has(email) || existingEmail.has(email))) {
      if (li && existingLi.has(li)) dupInDb++;
      else dupInCsv++;
      continue;
    }
    if (li) seenLi.add(li);
    if (email) seenEmail.add(email);
    inserts.push({
      workspace_id: WORKSPACE_ID,
      source_id: SOURCE_ID,
      full_name: name,
      email,
      linkedin_url: li,
      phone: asText(r["Candidate Phone Number"]),
      current_position: asText(r["Current Position"]),
      current_company_name: asText(r["Current Company"]),
      location: asText(r.City),
      summary: asText(r["Candidate Description"]),
    });
  }
  console.log(`   ${inserts.length} to insert`);
  console.log(`   skipped (no LI + no email): ${skippedNoKeys}`);
  console.log(`   skipped (dup in CSV):       ${dupInCsv}`);
  console.log(`   skipped (already in DB):    ${dupInDb}`);

  // Insert in batches.
  console.log(`🚀 Inserting in batches of ${BATCH}…`);
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const chunk = inserts.slice(i, i + BATCH);
    const { error } = await sb.from("candidates").insert(chunk);
    if (error) {
      console.error(`Batch ${i}-${i + chunk.length} failed:`, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    process.stdout.write(`   ${inserted}/${inserts.length}\r`);
  }
  console.log(`\n✅ Inserted ${inserted} candidates.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
