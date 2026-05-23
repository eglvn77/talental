import Link from "next/link";
import { notFound } from "next/navigation";
import {
  hiring,
  type CompanyRow,
  type ContactRow,
  type JobRow,
  type TeamMemberRow,
} from "@/lib/hiring";
import { Card, CardContent } from "@/components/ui/card";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { DeleteJobZone } from "./delete-job-zone";
import { ClientPicker } from "./client-picker";
import { FeeTermsCard } from "./fee-terms-card";

export const dynamic = "force-dynamic";

export default async function RoleSettingsTab({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const db = await hiring();
  const { data } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) notFound();
  const role = data as JobRow;

  let company: CompanyRow | null = null;
  if (role.company_id) {
    const { data: c } = await db
      .from("companies")
      .select("*")
      .eq("id", role.company_id)
      .maybeSingle();
    company = (c ?? null) as CompanyRow | null;
  }

  const { definitions, valuesByDefId } = await loadCustomFieldsForEntity(
    "job",
    role.id,
  );

  // FeeTermsCard needs contact, company, and team-member lists for the
  // lead-recipient + sourcer pickers. All workspace-scoped, tiny.
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
  const contacts = (contactsData ?? []) as Pick<
    ContactRow,
    "id" | "full_name"
  >[];
  const companies = (companiesData ?? []) as Pick<CompanyRow, "id" | "name">[];
  const teamMembers = (teamMembersData ?? []) as Pick<
    TeamMemberRow,
    "id" | "full_name" | "email"
  >[];

  return (
    <div className="space-y-5 py-4">
      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-semibold">Empresa</h2>
          <ClientPicker
            jobId={role.id}
            initial={
              company
                ? {
                    id: company.id,
                    name: company.name,
                    domain: company.domain,
                    logo_url: company.logo_url,
                    status: company.status,
                  }
                : null
            }
          />
          <p className="mt-3 text-xs text-muted-foreground">
            El resto de los datos de la vacante (título, modalidad,
            salario, fechas, etc.) viven en el tab{" "}
            <Link
              href={`/jobs/${role.id}/setup`}
              className="underline hover:text-foreground"
            >
              Info
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-semibold">Términos comerciales</h2>
          <FeeTermsCard
            job={role}
            contacts={contacts}
            companies={companies}
            teamMembers={teamMembers}
          />
        </CardContent>
      </Card>

      {definitions.length > 0 ? (
        <Card>
          <CardContent>
            <h2 className="mb-1 text-base font-semibold">Campos personalizados</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Definidos en{" "}
              <Link
                href="/settings/custom-fields/job"
                className="underline hover:text-foreground"
              >
                Configuración → Campos personalizados → Vacantes
              </Link>
              .
            </p>
            <CustomFieldsBlock
              entityId={role.id}
              definitions={definitions}
              initialValues={valuesByDefId}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-red-200">
        <CardContent>
          <h2 className="mb-1 text-base font-semibold text-red-700">
            Zona de peligro
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Eliminar la vacante borra sus etapas, candidaturas y bitácora.
            Los candidatos siguen en tu base de talento.
          </p>
          <DeleteJobZone jobId={role.id} title={role.title} />
        </CardContent>
      </Card>
    </div>
  );
}
