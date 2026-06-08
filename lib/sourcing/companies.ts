import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Dedup-and-create helper for company rows.
 *
 * Used when an enrichment provider (Unipile, future others) reports
 * a company name in a candidate's experience and we want a real
 * `hiring.companies` row so the in-app CompanyChip + the company
 * slideover work, AND so "all candidates from <company>" queries
 * resolve natively against the FK.
 *
 * Dedup strategy: normalize on lowercase(trim(name)) + workspace_id.
 * Returns the existing row's id if a match is found; inserts a
 * minimal stub otherwise.
 *
 * Uses the service-role client because callers are usually
 * background enrichment paths (cascade, extension save) that
 * don't have a Supabase session attached.
 */
export async function findOrCreateCompanyByName(
  workspaceId: string,
  rawName: string,
  opts: { logoUrl?: string | null; linkedinUrl?: string | null } = {},
): Promise<string | null> {
  const name = (rawName ?? "").trim();
  if (!name) return null;

  const sb = getSupabaseAdmin();
  // 1. Lookup. Postgres lower() + trim() in the WHERE makes this
  //    case- and whitespace-insensitive against the stored name.
  const { data: existing } = await sb
    .schema("hiring")
    .from("companies")
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("name", name) // case-insensitive exact match
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  // 2. Insert stub. Only the fields we have from the enrichment
  //    response — logo + linkedin url when provided.
  const insertPayload: Record<string, unknown> = {
    workspace_id: workspaceId,
    name,
  };
  if (opts.logoUrl) insertPayload.logo_url = opts.logoUrl;
  if (opts.linkedinUrl) insertPayload.linkedin_url = opts.linkedinUrl;

  const { data: created, error } = await sb
    .schema("hiring")
    .from("companies")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error || !created) {
    console.error(
      "[companies] findOrCreate insert failed:",
      error?.message ?? "no row",
      "name=",
      name,
    );
    return null;
  }
  return (created as { id: string }).id;
}
