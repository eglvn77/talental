import Link from "next/link";
import { notFound } from "next/navigation";
import {
  hiring,
  type CompanyRow,
  type JobRow,
  type TeamMemberRow,
} from "@/lib/hiring";
import { Card, CardContent } from "@/components/ui/card";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { DeleteJobZone } from "./delete-job-zone";
import { ClientPicker } from "./client-picker";
import { TeamPicker } from "./team-picker";
import { RoleConfigCard } from "./role-config-card";

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

  // Team member options + admin check for the Equipo picker. Only
  // admins can change assignments; recruiters see the assignee as
  // read-only text. RLS lets every workspace user see team_members
  // already, so the SELECT here just builds the dropdown options.
  const currentUser = await getCurrentUser();
  const canEditTeam = currentUser ? isAdmin(currentUser.team_member) : false;
  const { data: teamMembersData } = await db
    .from("team_members")
    .select("id, full_name, email, is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  const teamMembers = ((teamMembersData ?? []) as TeamMemberRow[]).map((m) => ({
    id: m.id,
    full_name: m.full_name,
    email: m.email,
  }));

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
          <h2 className="mb-3 text-base font-semibold">Equipo</h2>
          <TeamPicker
            jobId={role.id}
            currentRecruiterId={role.recruiter_team_member_id}
            members={teamMembers}
            canEdit={canEditTeam}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-1 text-base font-semibold">Configuración del rol</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Tipo de rol, idiomas y opciones del anuncio. Los usa la
            AI cuando corres Kickoff o Calibrar.
          </p>
          <RoleConfigCard
            jobId={role.id}
            initial={{
              roleType: role.role_type,
              jdLanguage: (role.jd_language as "es" | "en") ?? "es",
              outreachLanguage:
                (role.outreach_language as "es" | "en") ?? "es",
              aiProcessLanguage:
                (role.ai_process_language as "es" | "en" | null) ?? null,
              includeSalaryInPost: role.include_salary_in_post ?? false,
              includeCompanyInPost: role.include_company_in_post ?? false,
              useEmojisInJd: role.use_emojis_in_jd ?? true,
              createAssessment: role.create_assessment ?? false,
              assessmentLink: role.assessment_link,
            }}
          />
        </CardContent>
      </Card>

      {/* Términos comerciales moved to /jobs/[jobId]/terms — its
          own admin-only tab. */}

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
