import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ParsedProfile } from "@/lib/resume-parse";

/**
 * Loader for the public application share page (/portal/<slug> when
 * scope='application'). Pulls everything we need to render the
 * candidate-in-context-of-a-job public page.
 *
 * Implementation note: uses sequential plain SELECTs rather than
 * one PostgREST nested join. The earlier nested-join version
 * silently returned null when ANY relation alias (candidate, job,
 * stage) didn't resolve — and PortgREST is finicky about relation
 * disambiguation when there are multiple FKs to the same table OR
 * when typed FK constraints aren't introspectable. Plain queries
 * are slower (a handful of round-trips) but observable: each
 * one's failure mode is its own error string.
 *
 * Service-role only — anon can't read these tables. The token
 * resolution upstream is the only authorization check; everything
 * loaded here is scoped to the application_id from that token.
 */
export type ApplicationSharePayload = {
  candidate: {
    id: string;
    full_name: string;
    headline: string | null;
    location: string | null;
    profile_picture_url: string | null;
    linkedin_url: string | null;
    email: string | null;
    phone: string | null;
    current_position: string | null;
    current_company_name: string | null;
    resume_url: string | null;
  };
  parsedProfile: ParsedProfile | null;
  job: {
    id: string;
    title: string;
    company_name: string | null;
    company_logo_url: string | null;
  };
  application: {
    id: string;
    candidate_report: string | null;
    report_generated_at: string | null;
    stage_name: string | null;
    stage_color: string | null;
    category: string | null;
  };
};

export async function loadApplicationShare(
  applicationId: string,
): Promise<ApplicationSharePayload | null> {
  const sb = getSupabaseAdmin();
  const db = sb.schema("hiring");

  // 1. Application core columns.
  const { data: appRow, error: appErr } = await db
    .from("applications")
    .select(
      "id, candidate_id, job_id, stage_id, candidate_report, report_generated_at, category",
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr || !appRow) {
    console.error(
      "[share] application miss:",
      applicationId,
      appErr?.message ?? "no row",
    );
    return null;
  }
  const app = appRow as {
    id: string;
    candidate_id: string;
    job_id: string;
    stage_id: string | null;
    candidate_report: string | null;
    report_generated_at: string | null;
    category: string | null;
  };

  // 2. Candidate.
  const { data: candRow } = await db
    .from("candidates")
    .select(
      "id, full_name, headline, location, profile_picture_url, linkedin_url, email, phone, current_position, current_company_name, resume_url, parsed_profile",
    )
    .eq("id", app.candidate_id)
    .maybeSingle();
  if (!candRow) {
    console.error("[share] candidate miss:", app.candidate_id);
    return null;
  }
  const cand = candRow as {
    id: string;
    full_name: string;
    headline: string | null;
    location: string | null;
    profile_picture_url: string | null;
    linkedin_url: string | null;
    email: string | null;
    phone: string | null;
    current_position: string | null;
    current_company_name: string | null;
    resume_url: string | null;
    parsed_profile: unknown;
  };

  // 3. Job.
  const { data: jobRow } = await db
    .from("jobs")
    .select("id, title, company_id")
    .eq("id", app.job_id)
    .maybeSingle();
  if (!jobRow) {
    console.error("[share] job miss:", app.job_id);
    return null;
  }
  const job = jobRow as { id: string; title: string; company_id: string | null };

  // 4. Company (optional).
  let companyName: string | null = null;
  let companyLogoUrl: string | null = null;
  if (job.company_id) {
    const { data: companyRow } = await db
      .from("companies")
      .select("name, logo_url")
      .eq("id", job.company_id)
      .maybeSingle();
    if (companyRow) {
      companyName = (companyRow as { name: string }).name;
      companyLogoUrl = (companyRow as { logo_url: string | null }).logo_url;
    }
  }

  // 5. Stage (optional).
  let stageName: string | null = null;
  let stageColor: string | null = null;
  if (app.stage_id) {
    const { data: stageRow } = await db
      .from("pipeline_stages")
      .select("name, color")
      .eq("id", app.stage_id)
      .maybeSingle();
    if (stageRow) {
      stageName = (stageRow as { name: string }).name;
      stageColor = (stageRow as { color: string | null }).color;
    }
  }

  return {
    candidate: {
      id: cand.id,
      full_name: cand.full_name,
      headline: cand.headline,
      location: cand.location,
      profile_picture_url: cand.profile_picture_url,
      linkedin_url: cand.linkedin_url,
      email: cand.email,
      phone: cand.phone,
      current_position: cand.current_position,
      current_company_name: cand.current_company_name,
      resume_url: cand.resume_url,
    },
    parsedProfile: (cand.parsed_profile as ParsedProfile | null) ?? null,
    job: {
      id: job.id,
      title: job.title,
      company_name: companyName,
      company_logo_url: companyLogoUrl,
    },
    application: {
      id: app.id,
      candidate_report: app.candidate_report,
      report_generated_at: app.report_generated_at,
      stage_name: stageName,
      stage_color: stageColor,
      category: app.category,
    },
  };
}
