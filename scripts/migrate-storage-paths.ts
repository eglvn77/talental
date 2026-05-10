/**
 * Backfill: rename existing hiring-resumes objects from
 *   {candidate_id}/{file}
 * to
 *   {workspace_id}/{candidate_id}/{file}
 *
 * Run once. Idempotent: skips files already under a uuid prefix that
 * matches the candidate's workspace.
 *
 * Usage:
 *   npx --yes tsx --env-file=.env.local scripts/migrate-storage-paths.ts
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "hiring-resumes";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: cands, error } = await admin
    .schema("hiring")
    .from("candidates")
    .select("id, workspace_id, resume_url")
    .not("resume_url", "is", null);
  if (error) throw error;

  for (const c of cands ?? []) {
    const oldPath = c.resume_url as string;
    const expectedPrefix = `${c.workspace_id}/`;
    if (oldPath.startsWith(expectedPrefix)) {
      console.log(`SKIP ${c.id}: already workspace-prefixed (${oldPath})`);
      continue;
    }
    const newPath = `${c.workspace_id}/${oldPath}`;
    console.log(`MOVE ${c.id}:\n  from: ${oldPath}\n  to:   ${newPath}`);

    const { error: moveErr } = await admin.storage
      .from(BUCKET)
      .move(oldPath, newPath);
    if (moveErr) {
      console.error(`  storage.move failed:`, moveErr.message);
      process.exit(1);
    }

    const { error: updErr } = await admin
      .schema("hiring")
      .from("candidates")
      .update({ resume_url: newPath })
      .eq("id", c.id);
    if (updErr) {
      console.error(`  candidates UPDATE failed:`, updErr.message);
      process.exit(1);
    }
    console.log(`  ok`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
