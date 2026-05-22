"use server";

import { hiring } from "@/lib/hiring";
import { ensureAdmin, type ActionResult } from "./_shared";

export type GlobalSearchHit = {
  type: "job" | "company" | "candidate";
  id: string;
  title: string;
  /** Secondary line shown below the title in results. */
  subtitle: string | null;
  /** Where clicking the result navigates to. */
  href: string;
};

/**
 * Powers the Cmd+K palette. ILIKE pattern matches across the three
 * primary entities, in parallel, scoped to the user's workspace by
 * RLS. Each bucket is capped (`limitPerKind`) so the dialog stays
 * snappy. Candidate hits link to their most recent application's
 * slide-over so the recruiter lands somewhere actionable.
 */
export async function globalSearchAction(
  query: string,
  limitPerKind = 6,
): Promise<ActionResult<{ hits: GlobalSearchHit[] }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const q = query.trim();
  if (q.length < 2) {
    return { ok: true, data: { hits: [] } };
  }
  const pattern = `%${q}%`;
  const db = await hiring();

  const [jobs, companies, candidates] = await Promise.all([
    db
      .from("jobs")
      .select("id, title, status, company:companies(id, name)")
      .ilike("title", pattern)
      .order("created_at", { ascending: false })
      .limit(limitPerKind),
    db
      .from("companies")
      .select("id, name, domain, industry")
      .or(`name.ilike.${pattern},domain.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(limitPerKind),
    db
      .from("candidates")
      .select(
        "id, full_name, email, linkedin_url, applications:applications(id, job_id, applied_at)",
      )
      .or(
        `full_name.ilike.${pattern},email.ilike.${pattern},linkedin_url.ilike.${pattern},phone.ilike.${pattern}`,
      )
      .order("created_at", { ascending: false })
      .limit(limitPerKind),
  ]);

  const hits: GlobalSearchHit[] = [];

  type JobHit = {
    id: string;
    title: string;
    status: string;
    company:
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
  };
  for (const j of (jobs.data ?? []) as JobHit[]) {
    const comp = Array.isArray(j.company) ? j.company[0] : j.company;
    hits.push({
      type: "job",
      id: j.id,
      title: j.title,
      subtitle: comp ? comp.name : null,
      href: `/jobs/${j.id}`,
    });
  }

  type CompanyHit = {
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
  };
  for (const c of (companies.data ?? []) as CompanyHit[]) {
    hits.push({
      type: "company",
      id: c.id,
      title: c.name,
      subtitle: c.industry ?? c.domain ?? null,
      href: `/companies?company=${c.id}`,
    });
  }

  type CandidateHit = {
    id: string;
    full_name: string;
    email: string | null;
    linkedin_url: string | null;
    applications: Array<{ id: string; job_id: string; applied_at: string }>;
  };
  for (const cand of (candidates.data ?? []) as CandidateHit[]) {
    const apps = cand.applications ?? [];
    apps.sort((a, b) => b.applied_at.localeCompare(a.applied_at));
    const recent = apps[0];
    hits.push({
      type: "candidate",
      id: cand.id,
      title: cand.full_name,
      subtitle: cand.email ?? cand.linkedin_url,
      href: recent
        ? `/jobs/${recent.job_id}?contact=${recent.id}`
        : `/jobs`,
    });
  }

  return { ok: true, data: { hits } };
}
