import Link from "next/link";
import { notFound } from "next/navigation";
import {
  hiring,
  type CompanyRow,
  type JobRow,
  type TeamMemberRow,
} from "@/lib/hiring";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { DeleteJobZone } from "./delete-job-zone";
import { ClientPicker } from "./client-picker";
import { TeamPicker } from "./team-picker";
import { RoleDatesForm } from "./role-dates-form";
import { VisibilityPicker } from "./visibility-picker";

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
    <div className="mx-auto w-full max-w-4xl space-y-8 py-6">
      {/* Single untitled block with all the workspace-level config —
          empresa, recruiter, visibilidad, fechas, hiring manager —
          rendered inline as a labeled grid. Mirrors how Publicación
          drops the section titles and lets the field labels do the
          hierarchy work. */}
      <div className="space-y-4">
        <Field label="Empresa">
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
          <p className="text-[11px] text-muted-foreground">
            Los demás datos visibles (título, modalidad, salario…) viven
            en el tab{" "}
            <Link
              href={`/jobs/${role.id}/posting`}
              className="underline hover:text-foreground"
            >
              Publicación
            </Link>
            .
          </p>
        </Field>

        <Field label="Recruiter asignado">
          <TeamPicker
            jobId={role.id}
            currentRecruiterId={role.recruiter_team_member_id}
            members={teamMembers}
            canEdit={canEditTeam}
          />
        </Field>

        <Field label="Visibilidad">
          <VisibilityPicker
            jobId={role.id}
            initial={
              (role.visibility as "private" | "team" | undefined) ?? "private"
            }
            canEdit={canEditTeam}
          />
        </Field>

        <RoleDatesForm
          jobId={role.id}
          initial={{
            open_date: role.open_date,
            target_start_date: role.target_start_date,
            hiring_manager_name: role.hiring_manager_name,
            language_requirements: role.language_requirements,
          }}
        />
      </div>

      {/* Custom fields live in their own labeled block — they're the
          workspace's tunable schema, distinct from the role's fixed
          metadata above. */}
      {definitions.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Campos personalizados</h2>
            <p className="text-[11px] text-muted-foreground">
              <Link
                href="/settings/custom-fields/job"
                className="underline hover:text-foreground"
              >
                Configurar campos en Ajustes → Campos personalizados
              </Link>
            </p>
          </div>
          <CustomFieldsBlock
            entityId={role.id}
            definitions={definitions}
            initialValues={valuesByDefId}
          />
        </section>
      ) : null}

      <section className="space-y-3 border-t border-danger-soft pt-6">
        <div>
          <h2 className="text-sm font-semibold text-danger">
            Zona de peligro
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Eliminar la vacante borra sus etapas, candidaturas y bitácora.
            Los candidatos siguen en tu base de talento.
          </p>
        </div>
        <DeleteJobZone jobId={role.id} title={role.title} />
      </section>
    </div>
  );
}

/**
 * Inline field — small label above the control. Mirrors the Field
 * helper in posting-editor for visual consistency between the two
 * tabs.
 */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

