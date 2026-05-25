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
      <Block title="Empresa">
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
        <p className="text-xs text-muted-foreground">
          Los demás datos visibles de la vacante (título, modalidad,
          salario…) viven en el tab{" "}
          <Link
            href={`/jobs/${role.id}/posting`}
            className="underline hover:text-foreground"
          >
            Publicación
          </Link>
          .
        </p>
      </Block>

      <Block title="Equipo">
        <TeamPicker
          jobId={role.id}
          currentRecruiterId={role.recruiter_team_member_id}
          members={teamMembers}
          canEdit={canEditTeam}
        />
      </Block>

      <Block title="Fechas y hiring manager">
        <RoleDatesForm
          jobId={role.id}
          initial={{
            open_date: role.open_date,
            target_start_date: role.target_start_date,
            hiring_manager_name: role.hiring_manager_name,
            language_requirements: role.language_requirements,
          }}
        />
      </Block>

      {/* All `job` custom fields land here — including the two system-
          managed ones (Tipo de rol, Link del assessment) that the AI
          pipeline still reads off the job columns but whose UI now
          lives in the standard custom-field editor for consistency. */}
      {definitions.length > 0 ? (
        <Block
          title="Campos personalizados"
          subtitleLink={{
            href: "/settings/custom-fields/job",
            label: "Configurar campos en Ajustes → Campos personalizados",
          }}
        >
          <CustomFieldsBlock
            entityId={role.id}
            definitions={definitions}
            initialValues={valuesByDefId}
          />
        </Block>
      ) : null}

      <Block
        title="Zona de peligro"
        titleClass="text-danger"
        subtitle="Eliminar la vacante borra sus etapas, candidaturas y bitácora. Los candidatos siguen en tu base de talento."
      >
        <DeleteJobZone jobId={role.id} title={role.title} />
      </Block>
    </div>
  );
}

/**
 * Inline section block — matches the "less chrome" pattern used in
 * Paquete and Publicación. No card surrounds; just a small label +
 * optional subtitle + content. The visual hierarchy comes from the
 * generous `space-y-8` between blocks, not from individual borders.
 */
function Block({
  title,
  subtitle,
  subtitleLink,
  titleClass,
  children,
}: {
  title: string;
  subtitle?: string;
  subtitleLink?: { href: string; label: string };
  titleClass?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2
          className={`text-sm font-semibold ${
            titleClass ?? "text-foreground"
          }`}
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        ) : null}
        {subtitleLink ? (
          <p className="text-[11px] text-muted-foreground">
            <Link
              href={subtitleLink.href}
              className="underline hover:text-foreground"
            >
              {subtitleLink.label}
            </Link>
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
