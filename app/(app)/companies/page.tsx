import {
  hiring,
  type CompanyRow,
  type NoteRow,
  type JobRow,
} from "@/lib/hiring";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { EmptyState } from "../_components/empty-state";
import { CreateCompanyButton } from "./create-company-form";
import { CompanySlideover } from "./company-slideover";
import { CompaniesTable } from "./companies-table";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const params = await searchParams;
  const slideoverCompanyId = params.company;

  const db = await hiring();
  const { data, error } = await db
    .from("companies")
    .select("*")
    .order("name", { ascending: true });
  const companies = (data ?? []) as CompanyRow[];

  let slideoverCompany: CompanyRow | null = null;
  let slideoverRoles: JobRow[] = [];
  let slideoverNotes: NoteRow[] = [];
  if (slideoverCompanyId) {
    const { data: comp } = await db
      .from("companies")
      .select("*")
      .eq("id", slideoverCompanyId)
      .maybeSingle();
    slideoverCompany = (comp ?? null) as CompanyRow | null;
    if (slideoverCompany) {
      const [{ data: linkedRoles }, { data: noteRows }] = await Promise.all([
        db
          .from("jobs")
          .select("*")
          .eq("company_id", slideoverCompany.id)
          .order("created_at", { ascending: false }),
        db
          .from("notes")
          .select("*")
          .eq("entity_type", "company")
          .eq("entity_id", slideoverCompany.id)
          .order("created_at", { ascending: false }),
      ]);
      slideoverRoles = (linkedRoles ?? []) as JobRow[];
      slideoverNotes = (noteRows ?? []) as NoteRow[];
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-10">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <p className="text-sm text-muted-foreground">
          Empresas que sigues — clientes, prospectos, aliados.
        </p>
      </div>
      {/* URL-driven create slot (opens on `?create=1` from the sidebar "+" menu). */}
      <CreateCompanyButton />

      {error ? (
        <p className="mb-3 text-sm text-red-600">
          No se pudo cargar: {error.message}
        </p>
      ) : null}

      {companies.length === 0 ? (
        <EmptyState
          title="Aún no tienes empresas"
          description="Las empresas se crean automáticamente al abrir una vacante."
        />
      ) : (
        <CompaniesTable companies={companies} />
      )}

      {slideoverCompany ? (
        <CompanySlideoverWithCustomFields
          company={slideoverCompany}
          roles={slideoverRoles}
          notes={slideoverNotes}
        />
      ) : null}
    </main>
  );
}

async function CompanySlideoverWithCustomFields({
  company,
  roles,
  notes,
}: {
  company: CompanyRow;
  roles: JobRow[];
  notes: NoteRow[];
}) {
  const { definitions, valuesByDefId } = await loadCustomFieldsForEntity(
    "company",
    company.id,
  );
  return (
    <CompanySlideover
      company={company}
      roles={roles}
      notes={notes}
      customFieldDefinitions={definitions}
      customFieldValues={valuesByDefId}
      revalidatePath="/companies"
    />
  );
}
