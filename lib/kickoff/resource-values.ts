import "server-only";

import type { hiring } from "@/lib/hiring";

/**
 * Resource values are the new home for the 7 Paquete sections
 * (Phase 2 of the Resources rebuild). App code writes here; a
 * Postgres mirror-back trigger keeps `hiring.jobs.<column>` in sync
 * so any out-of-band reader (older queries, dashboards, the public
 * careers/portal pages, the still-static Paquete tabs) continues to
 * see the same content. Reads will migrate in Phase 3 alongside the
 * dynamic-tabs UI.
 *
 * Keys must match `hiring.resource_definitions.key` exactly — see
 * supabase/migrations/20260606010000_resources_a_tables_and_seed.sql
 * for the seed.
 */

export type SystemResourceKey =
  | "requirements"
  | "sourcing"
  | "hiring_process"
  | "application_questions"
  | "ai_interview_questions"
  | "talental_interview_script"
  | "outreach_sequence";

export type ResourceGeneratedBy =
  | "manual"
  | "ai_kickoff"
  | "ai_calibrate"
  | "ai_edit"
  | "backfill";

type Db = Awaited<ReturnType<typeof hiring>>;

/**
 * Look up the definition_id for (workspace, key). Cached per-process
 * is *not* worth it — Supabase clients are short-lived, and one
 * lookup per write keeps RLS honest. Returns null when the key is
 * not seeded for the workspace; the caller may choose to skip.
 */
async function getDefinitionId(
  db: Db,
  workspaceId: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("resource_definitions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("key", key)
    .maybeSingle();
  if (error) {
    throw new Error(
      `resource_definitions lookup failed for ${key}: ${error.message}`,
    );
  }
  return (data?.id as string | undefined) ?? null;
}

/**
 * Single-write entry point for the new resource model.
 *
 *   value === null  → upsert a row with value = null (the mirror
 *                     trigger nulls the legacy column to match).
 *   value === undefined → no-op (caller didn't touch the section).
 *
 * `generatedBy` records provenance — surfaces in the audit trail
 * once the per-section history UI lands. Calibrate sets
 * 'ai_calibrate'; kickoff sets 'ai_kickoff'; UI editors set 'manual'.
 */
export async function upsertResourceValue(args: {
  db: Db;
  workspaceId: string;
  jobId: string;
  key: SystemResourceKey;
  value: unknown;
  generatedBy: ResourceGeneratedBy;
}): Promise<void> {
  const definitionId = await getDefinitionId(
    args.db,
    args.workspaceId,
    args.key,
  );
  if (!definitionId) {
    // No definition for this workspace + key. Safer to throw than to
    // drop the write silently — every workspace gets the 7 system
    // defs at creation time (and on backfill).
    throw new Error(
      `resource_definitions row missing for workspace=${args.workspaceId} key=${args.key}`,
    );
  }

  const { error } = await args.db
    .from("resource_values")
    .upsert(
      {
        workspace_id: args.workspaceId,
        job_id: args.jobId,
        definition_id: definitionId,
        value: args.value as never,
        generated_by: args.generatedBy,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "job_id,definition_id" },
    );
  if (error) {
    throw new Error(
      `resource_values upsert failed (${args.key}): ${error.message}`,
    );
  }
}
