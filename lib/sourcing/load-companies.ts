import "server-only";

import { hiring, type CandidateRow } from "@/lib/hiring";
import type { CompanyChipData } from "@/app/(app)/_components/company-chip";

/**
 * Resolve every `company_id` referenced inside a candidate's
 * parsed_profile.experience jsonb into a Map<id, CompanyChipData> the
 * UI can use for hover popovers + click navigation.
 *
 * One IN query per candidate page render — far cheaper than per-row
 * lookups. Returns an empty map for candidates without enrichment.
 */
export async function loadReferencedCompaniesForCandidate(
  candidate: CandidateRow | null,
): Promise<Record<string, CompanyChipData>> {
  if (!candidate?.parsed_profile) return {};
  const ids = new Set<string>();
  const exp =
    (candidate.parsed_profile as {
      experience?: Array<{ company_id?: string }>;
    }).experience ?? [];
  for (const e of exp) {
    if (e.company_id) ids.add(e.company_id);
  }
  if (ids.size === 0) return {};
  const db = await hiring();
  const { data } = await db
    .from("companies")
    .select(
      "id, name, domain, website_url, linkedin_url, industry, size_range, hq_location, description, logo_url, employee_count, founded_year, company_type",
    )
    .in("id", Array.from(ids));
  const map: Record<string, CompanyChipData> = {};
  for (const row of (data ?? []) as CompanyChipData[]) {
    map[row.id] = row;
  }
  return map;
}
