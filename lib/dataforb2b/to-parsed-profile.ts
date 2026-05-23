import type { DfB2BEnrichResponse } from "./client";
import type {
  ParsedEducation,
  ParsedExperience,
  ParsedProfile,
} from "@/lib/resume-parse";

/**
 * Adapt DataForB2B's /enrich/profile response into our internal
 * ParsedProfile shape so the slideover's ParsedProfileSection
 * renders LinkedIn-imported profiles identically to PDF-parsed ones.
 *
 * Carries the optional logo URLs (company_logo_url, school_logo_url,
 * profile_picture_url) added in this same pass — PDF imports leave
 * those undefined.
 */
export function toParsedProfile(input: DfB2BEnrichResponse): ParsedProfile {
  const p = input.profile;

  const experience: ParsedExperience[] = (p.experience ?? []).map((e) => ({
    company: e.company?.name ?? "",
    title: e.title ?? "",
    start_date: e.start_date ?? undefined,
    end_date: e.end_date ?? undefined,
    location: e.location ?? undefined,
    company_logo_url: e.company?.logo_url ?? undefined,
    is_current: e.is_current ?? undefined,
  }));

  const education: ParsedEducation[] = (p.education ?? []).map((e) => ({
    school: e.school?.name ?? "",
    degree: e.degree ?? undefined,
    field: e.field_of_study ?? undefined,
    start_year: yearOf(e.start_date),
    end_year: yearOf(e.end_date),
    school_logo_url: e.school?.logo_url ?? undefined,
  }));

  const current = experience.find((e) => e.is_current) ?? experience[0];

  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();

  return {
    full_name: fullName || undefined,
    email: input.work_email ?? input.personal_email ?? undefined,
    phone: input.phone ?? undefined,
    location: p.location ?? undefined,
    linkedin_url: p.links?.linkedin ?? undefined,
    current_title: current?.title ?? undefined,
    current_company: current?.company ?? undefined,
    summary: p.summary ?? undefined,
    profile_picture_url: p.profile_picture_url ?? undefined,
    experience,
    education,
    skills: p.skills ?? [],
    languages: [],
  };
}

function yearOf(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})/.exec(s);
  return m ? m[1] : s;
}
