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
  searchParams: Promise<{ contact?: string }>;
}) {
  const params = await searchParams;
  const t = await getT();
  const slideoverId =
    params.contact && UUID_RE.test(params.contact) ? params.contact : null;

  const db = await hiring();
  const [{ data: contactsData, error }, { data: companiesData }] =
    await Promise.all([
      // Filter to "active" contacts — rows promoted into the candidates
      // table keep their history but stop appearing in this list.
      db
        .from("contacts")
        .select("*")
        .is("linked_candidate_id", null)
        .order("created_at", { ascending: false }),
      db.from("companies").select("*").order("name", { ascending: true }),
    ]);

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
        />
      )}

      {slideoverContact ? (
        <ContactSlideover
          contact={slideoverContact}
          company={slideoverCompany}
          companies={companyOptions}
        />
      ) : null}
    </main>
  );
}
