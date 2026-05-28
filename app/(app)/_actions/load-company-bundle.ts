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
    loadCustomFieldsForEntity("company", comp.id),
  ]);

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
  };
}
