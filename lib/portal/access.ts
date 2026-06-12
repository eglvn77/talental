import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { JobRow, PortalTokenRow } from "@/lib/hiring";

/**
 * Returns the list of jobs this token grants access to.
 *  - scope='job'     → exactly that one job (if it still exists).
 *  - scope='company' → every job belonging to that company.
 *
 * Result is cached at the request level by the caller (RSC).
 */
export async function jobsForToken(token: PortalTokenRow): Promise<JobRow[]> {
  const sb = getSupabaseAdmin();
  // Explicit column list — NEVER select("*") here. This row is
  // serialized into the RSC payload of a 'use client' component and
  // reaches the anonymous portal visitor's browser. hiring.jobs holds
  // commercially sensitive columns (fee_pct, monthly_retainer,
  // recruiter_split_pct, internal_notes, compensation_detail, …) that
  // must never leave the server. Only ship what the client renders
  // (CompanyJobsGrid: title + work_modality) plus the ids the pages
  // dereference (company_id).
  const q = sb
    .schema("hiring")
    .from("jobs")
    .select("id, title, work_modality, company_id")
    .eq("workspace_id", token.workspace_id);
  if (token.scope === "job" && token.job_id) {
    const { data } = await q.eq("id", token.job_id);
    return (data ?? []) as JobRow[];
  }
  if (token.scope === "company" && token.company_id) {
    const { data } = await q
      .eq("company_id", token.company_id)
      .order("created_at", { ascending: false });
    return (data ?? []) as JobRow[];
  }
  return [];
}

/**
 * True if `jobId` is reachable from this token. Use as a guard before
 * loading job-specific data.
 */
export async function tokenCanSeeJob(
  token: PortalTokenRow,
  jobId: string,
): Promise<boolean> {
  if (token.scope === "job") return token.job_id === jobId;
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .schema("hiring")
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .eq("company_id", token.company_id!)
    .eq("workspace_id", token.workspace_id)
    .maybeSingle();
  return Boolean(data);
}
