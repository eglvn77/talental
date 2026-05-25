import Link from "next/link";
import { Building2, Plus } from "lucide-react";
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
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Empresas</h1>
        {/* Icon-only quick-create — entity icon (Building2, matches
            the sidebar) with a tiny `+` badge. Tooltip on hover.
            Navigates here with `?create=1`, which pops the modal. */}
        <Link
          href="/companies?create=1"
          scroll={false}
          aria-label="Nueva empresa"
          title="Nueva empresa"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-fg-on-accent transition-colors hover:bg-accent/90"
        >
          <Building2 className="h-4 w-4" />
          <Plus
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent stroke-[3] ring-2 ring-bg-1"
            aria-hidden
          />
        </Link>
      </div>
      {/* URL-driven create modal — opens on `?create=1`. */}
      <CreateCompanyButton />

      {error ? (
        <p className="mb-3 text-sm text-danger">
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
