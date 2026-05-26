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

export async function loadCareersWorkspaceHeader(
  wsSlug: string,
): Promise<CareersWorkspaceHeader | null> {
  const db = careersDb();
  const { data, error } = await db.rpc("careers_get_workspace_header", {
    ws_slug: wsSlug,
  });
  if (error || !data || data.length === 0) return null;
  return data[0] as CareersWorkspaceHeader;
}

export async function loadCareersPublishedJobs(
  wsSlug: string,
): Promise<CareersJobListItem[]> {
  const db = careersDb();
  const { data, error } = await db.rpc("careers_list_published_jobs", {
    ws_slug: wsSlug,
  });
  if (error || !data) return [];
  return data as CareersJobListItem[];
}

export async function loadCareersPublishedJob(
  wsSlug: string,
  jobSlug: string,
): Promise<CareersJobDetail | null> {
  const db = careersDb();
  const { data, error } = await db.rpc("careers_get_published_job", {
    ws_slug: wsSlug,
    job_slug: jobSlug,
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
  wsSlug: string,
  jobSlug: string,
): Promise<CareersJobCustomField[]> {
  const db = careersDb();
  const { data, error } = await db.rpc("careers_get_job_custom_fields", {
    ws_slug: wsSlug,
    job_slug: jobSlug,
  });
  if (error || !data) return [];
  return data as CareersJobCustomField[];
}
