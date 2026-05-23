import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { hiring, type ContactRow, type CompanyRow } from "@/lib/hiring";
import { NewJobForm } from "./new-job-form";

export const dynamic = "force-dynamic";

/**
 * /jobs/new — open a vacante.
 *
 * Server component because the fee-terms block needs the workspace's
 * contact and company lists for the lead-recipient picker. Both lists
 * are small (workspace-scoped) so it's cheap to ship them in one
 * SSR pass — no need for a search combobox here yet.
 */
export default async function NewRolePage() {
  const db = await hiring();
  const [{ data: contactsData }, { data: companiesData }] = await Promise.all([
    db
      .from("contacts")
      .select("id, full_name")
      .order("full_name", { ascending: true }),
    db
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);
  const contacts = (contactsData ?? []) as Pick<ContactRow, "id" | "full_name">[];
  const companies = (companiesData ?? []) as Pick<CompanyRow, "id" | "name">[];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/jobs"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver a vacantes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Nueva vacante</h1>
        <p className="text-sm text-muted-foreground">
          Captura los términos comerciales al abrir. Se puede editar
          después en Ajustes o autocompletar con Kickoff.
        </p>
      </div>

      <Card>
        <CardContent>
          <NewJobForm contacts={contacts} companies={companies} />
        </CardContent>
      </Card>
    </main>
  );
}
