import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  hiring,
  type ContactRow,
  type CompanyRow,
  type TeamMemberRow,
} from "@/lib/hiring";
import { NewJobForm } from "./new-job-form";

export const dynamic = "force-dynamic";

/**
 * /jobs/new — open a vacante.
 *
 * Server component because the fee-terms block needs the workspace's
 * contact, company, and team-member lists for the lead-recipient and
 * sourcer pickers. Workspace-scoped — small enough to ship in one
 * SSR pass without a search combobox.
 */
export default async function NewRolePage() {
  const db = await hiring();
  const [
    { data: contactsData },
    { data: companiesData },
    { data: teamMembersData },
  ] = await Promise.all([
    db
      .from("contacts")
      .select("id, full_name")
      .order("full_name", { ascending: true }),
    db
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true }),
    db
      .from("team_members")
      .select("id, full_name, email")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);
  const contacts = (contactsData ?? []) as Pick<ContactRow, "id" | "full_name">[];
  const companies = (companiesData ?? []) as Pick<CompanyRow, "id" | "name">[];
  const teamMembers = (teamMembersData ?? []) as Pick<
    TeamMemberRow,
    "id" | "full_name" | "email"
  >[];

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
          <NewJobForm
            contacts={contacts}
            companies={companies}
            teamMembers={teamMembers}
          />
        </CardContent>
      </Card>
    </main>
  );
}
