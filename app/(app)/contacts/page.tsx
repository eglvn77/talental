import Link from "next/link";
import { BookUser, Plus } from "lucide-react";
import {
  hiring,
  type CompanyRow,
  type ContactRow,
} from "@/lib/hiring";
import { loadCustomFieldsForList } from "@/lib/custom-fields";
import { EmptyState } from "../_components/empty-state";
import { ContactsTable } from "./contacts-table";
import { CreateContactButton } from "./create-contact-form";
import { ContactSlideover } from "./contact-slideover";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    contact?: string;
    page?: string;
    per?: string;
    q?: string;
    company?: string;
    title?: string;
    location?: string;
    owner?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const t = await getT();
  const slideoverId =
    params.contact && UUID_RE.test(params.contact) ? params.contact : null;

  const PER_PAGE_OPTIONS = new Set([25, 50, 100, 200]);
  const perRaw = Number(params.per ?? 25);
  const per = PER_PAGE_OPTIONS.has(perRaw) ? perRaw : 25;
  const pageRaw = Number(params.page ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const offset = (page - 1) * per;
  const q = (params.q ?? "").trim();
  const companyIdsFilter = (params.company ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const titleValues = (params.title ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const locationValues = (params.location ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // owner: explicit team_member ids, plus a synthetic "" entry for
  // "unassigned" rows (owner_id IS NULL). Pattern matches the
  // recruiter filter on /jobs.
  const ownerIds = (params.owner ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ownerUnassigned = ownerIds.includes("");
  const ownerRealIds = ownerIds.filter((s) => s !== "");
  const SORT_COLUMNS: Record<string, string> = {
    name: "full_name",
    title: "title",
    email: "email",
    location: "location",
    created: "created_at",
  };
  const sortKey = params.sort && SORT_COLUMNS[params.sort] ? params.sort : "created";
  const sortCol = SORT_COLUMNS[sortKey];
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const db = await hiring();
  const safeQ = q.replace(/[%_,()]/g, "");
  let dataQ = db
    .from("contacts")
    .select("*")
    .is("linked_candidate_id", null);
  let countQ = db
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .is("linked_candidate_id", null);
  if (safeQ) {
    const pat = `%${safeQ}%`;
    const orFilter = `full_name.ilike.${pat},email.ilike.${pat},title.ilike.${pat}`;
    dataQ = dataQ.or(orFilter);
    countQ = countQ.or(orFilter);
  }
  if (companyIdsFilter.length > 0) {
    dataQ = dataQ.in("company_id", companyIdsFilter);
    countQ = countQ.in("company_id", companyIdsFilter);
  }
  if (titleValues.length > 0) {
    dataQ = dataQ.in("title", titleValues);
    countQ = countQ.in("title", titleValues);
  }
  if (locationValues.length > 0) {
    dataQ = dataQ.in("location", locationValues);
    countQ = countQ.in("location", locationValues);
  }
  if (ownerIds.length > 0) {
    // "" = unassigned (NULL owner). Combine with explicit ids via OR.
    if (ownerUnassigned && ownerRealIds.length === 0) {
      dataQ = dataQ.is("owner_id", null);
      countQ = countQ.is("owner_id", null);
    } else if (ownerUnassigned) {
      const orFilter = `owner_id.is.null,owner_id.in.(${ownerRealIds.join(",")})`;
      dataQ = dataQ.or(orFilter);
      countQ = countQ.or(orFilter);
    } else {
      dataQ = dataQ.in("owner_id", ownerRealIds);
      countQ = countQ.in("owner_id", ownerRealIds);
    }
  }

  // Options queries — distinct title + location, plus the workspace's
  // team_members (for the owner picker). Run in parallel with the main
  // queries. Title/location capped at 2000 raw rows → top 200 by
  // frequency in JS.
  const titleOptionsQuery = db
    .from("contacts")
    .select("title")
    .is("linked_candidate_id", null)
    .not("title", "is", null)
    .neq("title", "")
    .limit(2000);
  const locationOptionsQuery = db
    .from("contacts")
    .select("location")
    .is("linked_candidate_id", null)
    .not("location", "is", null)
    .neq("location", "")
    .limit(2000);
  const ownersQuery = db
    .from("team_members")
    .select("id, full_name")
    .order("full_name", { ascending: true });

  const [
    { data: contactsData, error },
    { data: companiesData },
    contactsCountRes,
    titleOptsRes,
    locationOptsRes,
    ownersRes,
  ] = await Promise.all([
    dataQ
      .order(sortCol, { ascending: sortDir === "asc" })
      .range(offset, offset + per - 1),
    db.from("companies").select("*").order("name", { ascending: true }),
    countQ,
    titleOptionsQuery,
    locationOptionsQuery,
    ownersQuery,
  ]);
  const contactsTotal = contactsCountRes.count ?? 0;

  const titleOptions = topByFrequency(
    (titleOptsRes.data ?? []).map((r) => (r as { title: string | null }).title),
    200,
  );
  const locationOptions = topByFrequency(
    (locationOptsRes.data ?? []).map(
      (r) => (r as { location: string | null }).location,
    ),
    200,
  );
  const ownerOptions = ((ownersRes.data ?? []) as Array<{ id: string; full_name: string }>);

  const contacts = (contactsData ?? []) as ContactRow[];
  const companies = (companiesData ?? []) as CompanyRow[];
  const companiesById: Record<string, CompanyRow> = {};
  for (const c of companies) companiesById[c.id] = c;

  const slideoverContact = slideoverId
    ? contacts.find((c) => c.id === slideoverId) ?? null
    : null;
  const slideoverCompany =
    slideoverContact?.company_id
      ? companiesById[slideoverContact.company_id] ?? null
      : null;

  // Deals where this contact is the primary contact — surfaces the
  // CRM history beside the editable fields. Lightweight query (one
  // row per deal, no joins). Empty array when no slideover or no
  // deals.
  const { data: dealRows } = slideoverContact
    ? await db
        .from("deals")
        .select(
          "id, title, stage, value_amount, value_currency, expected_close_date, closed_at",
        )
        .eq("primary_contact_id", slideoverContact.id)
        .order("created_at", { ascending: false })
    : { data: [] as Array<unknown> };
  const slideoverDeals = (dealRows ?? []) as Array<{
    id: string;
    title: string;
    stage: string;
    value_amount: number | null;
    value_currency: string | null;
    expected_close_date: string | null;
    closed_at: string | null;
  }>;

  const companyOptions = companies.map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("contacts.title")}</h1>
        {/* Icon-only quick-create — entity icon (BookUser, matches
            the sidebar) + `+` badge, tooltip on hover. */}
        <Link
          href="/contacts?create=1"
          scroll={false}
          aria-label={t("contacts.newContact")}
          title={t("contacts.newContact")}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-fg-on-accent transition-colors hover:bg-accent/90"
        >
          <BookUser className="h-4 w-4" />
          <Plus
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent stroke-[3] ring-2 ring-bg-1"
            aria-hidden
          />
        </Link>
      </div>
      {/* URL-driven create modal — opens on `?create=1`. */}
      <CreateContactButton companies={companyOptions} />

      {error ? (
        <p className="mb-3 text-sm text-danger">
          {t("common.loadError", { message: error.message })}
        </p>
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState
          title={t("contacts.emptyTitle")}
          description={t("contacts.emptyDesc")}
        />
      ) : (
        <ContactsTable
          contacts={contacts}
          companiesById={companiesById}
          customFields={await loadCustomFieldsForList(
            "contact",
            contacts.map((c) => c.id),
          )}
          total={contactsTotal}
          titleOptions={titleOptions}
          locationOptions={locationOptions}
          ownerOptions={ownerOptions}
        />
      )}

      {slideoverContact ? (
        <ContactSlideover
          contact={slideoverContact}
          company={slideoverCompany}
          companies={companyOptions}
          deals={slideoverDeals}
        />
      ) : null}
    </main>
  );
}

/**
 * Dedupe + count strings, return top N by frequency. Pure JS helper.
 * Inline duplicate of the same helper in candidates/page.tsx and
 * companies/page.tsx — will extract to a shared lib once we touch a
 * fourth caller.
 */
function topByFrequency(
  values: Array<string | null>,
  limit: number,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = raw?.trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}
