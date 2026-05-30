"use server";

import {
  hiring,
  type CompanyRow,
  type JobRow,
  type JobStatusRow,
  type NoteRow,
} from "@/lib/hiring";
import type { Database } from "@/supabase/types";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { getT } from "@/lib/i18n/server";
import {
  loadCompanyStatuses,
  companyStatusMap,
  type CompanyStatusDisplay,
} from "@/lib/company-status";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinkedContact = Pick<
  Database["hiring"]["Tables"]["contacts"]["Row"],
  "id" | "full_name" | "title" | "email"
>;

export type LinkedDeal = Pick<
  Database["hiring"]["Tables"]["deals"]["Row"],
  "id" | "title" | "stage" | "value_amount" | "value_currency"
>;

export type CompanyEvent = Pick<
  Database["hiring"]["Tables"]["company_events"]["Row"],
  "id" | "kind" | "summary" | "payload" | "created_at"
> & {
  actor: { full_name: string } | null;
};

export type CompanyCandidate = {
  applicationId: string;
  candidateId: string;
  fullName: string;
  email: string | null;
  appliedAt: string;
  statusChangedAt: string;
  resumeUrl: string | null;
  job: { id: string; title: string };
  stage: {
    id: string;
    name: string;
    color: string | null;
    category: string;
  } | null;
};

/** Pagination context — lets the slideover show "N de M" + prev/next
 *  buttons. Ordered alphabetically by company name across the whole
 *  workspace (matches the default /companies table sort). */
export type CompanyNav = {
  index: number; // 1-based for display
  total: number;
  prevCompanyId: string | null;
  nextCompanyId: string | null;
};

export type CompanyBundle = {
  company: CompanyRow;
  roles: Array<JobRow & { status: JobStatusRow | null }>;
  notes: NoteRow[];
  customFieldDefinitions: Awaited<
    ReturnType<typeof loadCustomFieldsForEntity>
  >["definitions"];
  customFieldValues: Awaited<
    ReturnType<typeof loadCustomFieldsForEntity>
  >["valuesByDefId"];
  linkedContacts: LinkedContact[];
  linkedDeals: LinkedDeal[];
  events: CompanyEvent[];
  candidates: CompanyCandidate[];
  nav: CompanyNav;
  /** Per-workspace company-status display (key → label + color).
   *  Drives the status select + indicator. */
  statusConfig: Record<string, CompanyStatusDisplay>;
  /** Status keys in admin-defined order, for the Estado dropdown. */
  statusOrder: string[];
};

/**
 * Server-side bundle loader for the company slideover. Lets a
 * client-side global host (mounted in `(app)/layout.tsx`) fetch
 * everything the existing `<CompanySlideover>` needs without each
 * page that wants to surface the slideover having to wire it up.
 *
 * RLS scopes the read; an id that doesn't belong to the current
 * workspace simply returns null and the host renders nothing.
 */
export async function loadCompanyBundleAction(
  id: string,
): Promise<CompanyBundle | null> {
  if (!id || !UUID_RE.test(id)) return null;
  const db = await hiring();
  const t = await getT();

  const { data: comp } = await db
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!comp) return null;

  const [
    { data: linkedRoles },
    { data: noteRows },
    { data: contactRows },
    { data: dealRows },
    { data: eventRows },
    { data: candidateRows },
    { data: allCompanyIds },
    statusRows,
    customFields,
  ] = await Promise.all([
    db
      .from("jobs")
      .select("*, status:job_statuses(*)")
      .eq("company_id", comp.id)
      .order("created_at", { ascending: false }),
    db
      .from("notes")
      .select("*")
      .eq("entity_type", "company")
      .eq("entity_id", comp.id)
      .order("created_at", { ascending: false }),
    db
      .from("contacts")
      .select("id, full_name, title, email")
      .eq("company_id", comp.id)
      .order("full_name", { ascending: true }),
    db
      .from("deals")
      .select("id, title, stage, value_amount, value_currency")
      .eq("company_id", comp.id)
      .order("created_at", { ascending: false }),
    db
      .from("company_events")
      .select("id, kind, summary, payload, created_at, actor:team_members(full_name)")
      .eq("company_id", comp.id)
      .order("created_at", { ascending: false })
      .limit(50),
    // Two-hop join: applications → jobs (filter by company) → candidate.
    // Powers the "Candidatos" tab — every candidate that's ever applied
    // to any vacante of this company. Cap at 500 so a long-tenured
    // client doesn't tank the slideover.
    db
      .from("applications")
      .select(
        `
        id, applied_at, status_changed_at,
        job:jobs!inner(id, title, company_id),
        candidate:candidates(id, full_name, email, resume_url),
        stage:pipeline_stages(id, name, color, category)
      `,
      )
      .eq("job.company_id", comp.id)
      .order("status_changed_at", { ascending: false })
      .limit(500),
    // Pagination context — alphabetical workspace-wide list of ids
    // matches the /companies table default sort. RLS scopes; cheap
    // (just ids).
    db.from("companies").select("id, name").order("name", { ascending: true }),
    loadCompanyStatuses(),
    loadCustomFieldsForEntity("company", comp.id),
  ]);

  // Massage the application rows into a flatter shape the slideover
  // can map over directly. Drop applications whose job join didn't
  // come back (shouldn't happen with !inner but stay defensive).
  type AppQueryRow = {
    id: string;
    applied_at: string;
    status_changed_at: string;
    job: { id: string; title: string; company_id: string | null } | null;
    candidate: {
      id: string;
      full_name: string | null;
      email: string | null;
      resume_url: string | null;
    } | null;
    stage: {
      id: string;
      name: string;
      color: string | null;
      category: string;
    } | null;
  };
  const candidates: CompanyCandidate[] = (
    (candidateRows ?? []) as unknown as AppQueryRow[]
  )
    .filter((a) => a.job && a.candidate)
    .map((a) => ({
      applicationId: a.id,
      candidateId: a.candidate!.id,
      fullName: a.candidate!.full_name ?? t("errors.untitled"),
      email: a.candidate!.email,
      appliedAt: a.applied_at,
      statusChangedAt: a.status_changed_at,
      resumeUrl: a.candidate!.resume_url,
      job: { id: a.job!.id, title: a.job!.title },
      stage: a.stage,
    }));

  // Resolve prev/next via the alphabetically-sorted id list.
  const ids = ((allCompanyIds ?? []) as Array<{ id: string; name: string }>).map(
    (r) => r.id,
  );
  const currentIdx = ids.indexOf(comp.id as string);
  const nav: CompanyNav = {
    index: currentIdx >= 0 ? currentIdx + 1 : 1,
    total: ids.length,
    prevCompanyId: currentIdx > 0 ? ids[currentIdx - 1]! : null,
    nextCompanyId:
      currentIdx >= 0 && currentIdx < ids.length - 1
        ? ids[currentIdx + 1]!
        : null,
  };

  return {
    company: comp as CompanyRow,
    roles: (linkedRoles ?? []) as Array<
      JobRow & { status: JobStatusRow | null }
    >,
    notes: (noteRows ?? []) as NoteRow[],
    customFieldDefinitions: customFields.definitions,
    customFieldValues: customFields.valuesByDefId,
    linkedContacts: (contactRows ?? []) as LinkedContact[],
    linkedDeals: (dealRows ?? []) as LinkedDeal[],
    events: (eventRows ?? []) as unknown as CompanyEvent[],
    candidates,
    nav,
    statusConfig: companyStatusMap(statusRows),
    statusOrder: statusRows.map((r) => r.key),
  };
}
