import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Anon-only Supabase client for the careers route group. Distinct
 * from the authenticated client used inside `(app)` — these pages run
 * for visitors with no session, so we use the public anon key and
 * skip cookie + session plumbing.
 *
 * Reads come from `hiring.careers_*` SECURITY DEFINER functions that
 * each filter to publicly-visible rows; the anon role has EXECUTE on
 * those functions only (no direct table reads).
 *
 * Public identifiers are UUIDs. We tried slugs first but they have
 * two problems: (a) two agencies can pick the same slug; (b) job
 * slugs are derived from the title, so renaming a vacante after
 * publishing it would silently break every shared link. UUIDs are
 * stable until the row is deleted — which is exactly the lifetime we
 * want for a "publish & share" link.
 */
function careersDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "hiring" },
    },
  );
}

export type CareersWorkspaceHeader = {
  id: string;
  name: string;
  logo_url: string | null;
  accent_color: string | null;
  careers_tagline: string | null;
};

export type CareersJobListItem = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_logo_url: string | null;
  workspace_accent_color: string | null;
  workspace_careers_tagline: string | null;
  title: string;
  slug: string;
  work_modality: string | null;
  location: string | null;
  show_company_in_posting: boolean;
  company_name: string | null;
  company_logo_url: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_frequency: string;
  show_salary_in_posting: boolean;
  published_at: string | null;
};

export type CareersJobDetail = CareersJobListItem & {
  posting_language: "es" | "en";
  contract_type: string | null;
  working_hours: string | null;
  company_domain: string | null;
  public_description: string | null;
  require_cv: boolean;
  ask_for_location: boolean;
  ask_for_salary_expectations: boolean;
  screening_questions: unknown;
  publication_status: "draft" | "listed" | "unlisted";
  status: string;
};

/**
 * UUID v4 sniffer. We use it to short-circuit the RPC call when the
 * URL segment is obviously not an id (e.g. a stale slug-based link
 * still floating around). Returning `null` triggers a 404 in the
 * caller without burning a round-trip.
 */
function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

export async function loadCareersWorkspaceHeader(
  wsId: string,
): Promise<CareersWorkspaceHeader | null> {
  if (!looksLikeUuid(wsId)) return null;
  const db = careersDb();
  const { data, error } = await db.rpc("careers_get_workspace_header", {
    ws_id: wsId,
  });
  if (error || !data || data.length === 0) return null;
  return data[0] as CareersWorkspaceHeader;
}

export async function loadCareersPublishedJobs(
  wsId: string,
): Promise<CareersJobListItem[]> {
  if (!looksLikeUuid(wsId)) return [];
  const db = careersDb();
  const { data, error } = await db.rpc("careers_list_published_jobs", {
    ws_id: wsId,
  });
  if (error || !data) return [];
  return data as CareersJobListItem[];
}

export async function loadCareersPublishedJob(
  wsId: string,
  jobId: string,
): Promise<CareersJobDetail | null> {
  if (!looksLikeUuid(wsId) || !looksLikeUuid(jobId)) return null;
  const db = careersDb();
  const { data, error } = await db.rpc("careers_get_published_job", {
    ws_id: wsId,
    job_id: jobId,
  });
  if (error || !data || data.length === 0) return null;
  return data[0] as CareersJobDetail;
}

export type CareersJobCustomField = {
  definition_id: string;
  key: string;
  label: string;
  kind:
    | "text"
    | "long_text"
    | "number"
    | "boolean"
    | "date"
    | "select"
    | "multi_select"
    | "url"
    | "email";
  options: string[] | null;
  ordinal: number;
  value: unknown;
};

/**
 * Workspace-defined job custom fields flagged `show_in_postings` +
 * their values for one specific job. The RPC also enforces the
 * publishable check, so a draft / non-active job returns an empty
 * array.
 */
export async function loadCareersJobCustomFields(
  wsId: string,
  jobId: string,
): Promise<CareersJobCustomField[]> {
  if (!looksLikeUuid(wsId) || !looksLikeUuid(jobId)) return [];
  const db = careersDb();
  const { data, error } = await db.rpc("careers_get_job_custom_fields", {
    ws_id: wsId,
    job_id: jobId,
  });
  if (error || !data) return [];
  return data as CareersJobCustomField[];
}
