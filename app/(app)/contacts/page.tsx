import {
  hiring,
  type CompanyRow,
  type ContactRow,
} from "@/lib/hiring";
import { EmptyState } from "../_components/empty-state";
import { ContactsTable } from "./contacts-table";
import { CreateContactButton } from "./create-contact-form";
import { ContactSlideover } from "./contact-slideover";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string }>;
}) {
  const params = await searchParams;
  const slideoverId =
    params.contact && UUID_RE.test(params.contact) ? params.contact : null;

  const db = await hiring();
  const [{ data: contactsData, error }, { data: companiesData }] =
    await Promise.all([
      db.from("contacts").select("*").order("created_at", { ascending: false }),
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
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Contactos</h1>
        <p className="text-sm text-muted-foreground">
          Personas que NO son candidatos — clientes, hiring managers,
          networking.
        </p>
      </div>
      {/* URL-driven create slot (opens on `?create=1` from the sidebar "+" menu). */}
      <CreateContactButton companies={companyOptions} />

      {error ? (
        <p className="mb-3 text-sm text-red-600">
          No se pudo cargar: {error.message}
        </p>
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState
          title="Aún no tienes contactos"
          description="Agrega tu primer contacto — clientes, hiring managers, etc."
        />
      ) : (
        <ContactsTable contacts={contacts} companiesById={companiesById} />
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
