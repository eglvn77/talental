import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  cachedAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

export type PortalLinkRow = {
  id: string;
  slug: string;
  manatal_job_id: number;
  manatal_job_position_name: string | null;
  manatal_organization_name: string | null;
  client_display_name: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  last_viewed_at: string | null;
  job_description: string | null;
};

export type CandidateCacheRow = {
  id: string;
  manatal_job_id: number;
  manatal_match_id: number;
  manatal_candidate_id: number;
  candidate_slug: string;
  candidate_full_name: string;
  stage_name: string | null;
  stage_rank: number | null;
  linkedin_url: string | null;
  has_resume: boolean;
  attachment_count: number;
  is_active_match: boolean;
  email: string | null;
  current_company: string | null;
  current_position: string | null;
  description: string | null;
  candidate_report_html: string | null;
  location: string | null;
  current_comp_amount: number | null;
  current_comp_currency: string | null;
  current_comp_frequency: string | null;
  raw_match_json: unknown;
  raw_candidate_json: unknown;
  raw_experiences_json: unknown;
  raw_educations_json: unknown;
  raw_attachments_json: unknown;
  submitted_at: string | null;
  dropped_at: string | null;
  match_is_active: boolean;
  last_synced_at: string;
};

export type CandidateNoteRow = {
  id: string;
  candidate_cache_id: string;
  portal_link_id: string;
  author_name: string;
  note_text: string;
  created_at: string;
};
