import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { hiring, type CompanyRow } from "@/lib/hiring";
import { resolveCompanyStatusConfig } from "@/lib/company-status";
import { EmptyState } from "../_components/empty-state";
import { CreateCompanyButton } from "./create-company-form";
import { CompaniesTable } from "./companies-table";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const db = await hiring();
  const [{ data, error }, { data: wsRow }] = await Promise.all([
    db.from("companies").select("*").order("name", { ascending: true }),
    db.from("workspaces").select("company_status_config").maybeSingle(),
  ]);
  const companies = (data ?? []) as CompanyRow[];
  const statusConfig = resolveCompanyStatusConfig(
    wsRow?.company_status_config ?? null,
  );

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
        <CompaniesTable companies={companies} statusConfig={statusConfig} />
      )}

      {/* The `?company=<id>` slideover is mounted globally in
          (app)/layout.tsx so any route can open a company profile
          without leaving the current page. */}
    </main>
  );
}
