import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ParsedProfile } from "@/lib/resume-parse";

/**
 * Loader for the public application share page (/portal/<slug> when
 * scope='application'). Pulls everything we need to render the
 * candidate-in-context-of-a-job public page in ONE place:
 *
 *   - Candidate basics (name, headline, location, linkedin, picture,
 *     contact, resume_url)
 *   - Parsed profile (experience, education, skills, languages)
 *   - Job context (title, company name + logo)
 *   - Application's AI report (markdown/HTML + rating)
 *   - Application's current stage (for the progress chip)
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

  const { data: appRow } = await sb
    .schema("hiring")
    .from("applications")
    .select(
      `
      id,
      candidate_report,
      report_generated_at,
      category,
      candidate:candidates(
        id, full_name, headline, location,
        profile_picture_url, linkedin_url,
        email, phone,
        current_position, current_company_name,
        resume_url, parsed_profile
      ),
      job:jobs(
        id, title,
        company:companies(name, logo_url)
      ),
      stage:pipeline_stages(name, color)
      `,
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (!appRow) return null;

  // PostgREST joins can come back as array OR object depending on
  // FK cardinality. Normalize both.
  const arr = <T>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? v[0] ?? null : v ?? null;
  const row = appRow as unknown as {
    id: string;
    candidate_report: string | null;
    report_generated_at: string | null;
    category: string | null;
    candidate:
      | {
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
        }
      | Array<unknown>
      | null;
    job:
      | {
          id: string;
          title: string;
          company: { name: string; logo_url: string | null } | Array<unknown> | null;
        }
      | Array<unknown>
      | null;
    stage:
      | { name: string; color: string | null }
      | Array<unknown>
      | null;
  };
  const candidate = arr(row.candidate as never);
  const job = arr(row.job as never);
  const stage = arr(row.stage as never);
  if (!candidate || !job) return null;

  const company = arr((job as { company: unknown }).company as never);

  return {
    candidate: {
      id: (candidate as { id: string }).id,
      full_name: (candidate as { full_name: string }).full_name,
      headline: (candidate as { headline: string | null }).headline,
      location: (candidate as { location: string | null }).location,
      profile_picture_url:
        (candidate as { profile_picture_url: string | null }).profile_picture_url,
      linkedin_url: (candidate as { linkedin_url: string | null }).linkedin_url,
      email: (candidate as { email: string | null }).email,
      phone: (candidate as { phone: string | null }).phone,
      current_position:
        (candidate as { current_position: string | null }).current_position,
      current_company_name:
        (candidate as { current_company_name: string | null })
          .current_company_name,
      resume_url: (candidate as { resume_url: string | null }).resume_url,
    },
    parsedProfile:
      ((candidate as { parsed_profile: unknown }).parsed_profile as
        | ParsedProfile
        | null) ?? null,
    job: {
      id: (job as { id: string }).id,
      title: (job as { title: string }).title,
      company_name: (company as { name?: string } | null)?.name ?? null,
      company_logo_url:
        (company as { logo_url?: string | null } | null)?.logo_url ?? null,
    },
    application: {
      id: row.id,
      candidate_report: row.candidate_report,
      report_generated_at: row.report_generated_at,
      stage_name: (stage as { name?: string } | null)?.name ?? null,
      stage_color: (stage as { color?: string | null } | null)?.color ?? null,
      category: row.category,
    },
  };
}
