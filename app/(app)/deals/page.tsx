import {
  hiring,
  type CompanyRow,
  type ContactRow,
  type DealRow,
} from "@/lib/hiring";
import { EmptyState } from "../_components/empty-state";
import { DealsBoard } from "./deals-board";
import { CreateDealButton } from "./create-deal-form";
import { DealSlideover } from "./deal-slideover";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string }>;
}) {
  const params = await searchParams;
  const slideoverId =
    params.deal && UUID_RE.test(params.deal) ? params.deal : null;

  const db = await hiring();
  const [
    { data: dealsData, error },
    { data: companiesData },
    { data: contactsData },
  ] = await Promise.all([
    db.from("deals").select("*").order("created_at", { ascending: false }),
    db.from("companies").select("*").order("name", { ascending: true }),
    db.from("contacts").select("*").order("full_name", { ascending: true }),
  ]);

  const deals = (dealsData ?? []) as DealRow[];
  const companies = (companiesData ?? []) as CompanyRow[];
  const contacts = (contactsData ?? []) as ContactRow[];

  const companiesById: Record<string, CompanyRow> = {};
  for (const c of companies) companiesById[c.id] = c;
  const contactsById: Record<string, ContactRow> = {};
  for (const c of contacts) contactsById[c.id] = c;

  const companyOptions = companies.map((c) => ({ id: c.id, name: c.name }));
  const contactOptions = contacts.map((c) => ({
    id: c.id,
    full_name: c.full_name,
  }));

  const slideoverDeal = slideoverId
    ? deals.find((d) => d.id === slideoverId) ?? null
    : null;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-6 py-10">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">CRM</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline de oportunidades con clientes y prospectos.
          </p>
        </div>
        <CreateDealButton companies={companyOptions} />
      </div>

      {error ? (
        <p className="mb-3 text-sm text-red-600">
          No se pudo cargar: {error.message}
        </p>
      ) : null}

      {deals.length === 0 ? (
        <EmptyState
          title="Aún no tienes deals"
          description="Empieza tu pipeline con un primer deal — empresa, monto y etapa."
        />
      ) : (
        <DealsBoard
          deals={deals}
          companiesById={companiesById}
          contactsById={contactsById}
        />
      )}

      {slideoverDeal ? (
        <DealSlideover
          deal={slideoverDeal}
          company={
            slideoverDeal.company_id
              ? companiesById[slideoverDeal.company_id] ?? null
              : null
          }
          contact={
            slideoverDeal.primary_contact_id
              ? contactsById[slideoverDeal.primary_contact_id] ?? null
              : null
          }
          companies={companyOptions}
          contacts={contactOptions}
        />
      ) : null}
    </main>
  );
}
