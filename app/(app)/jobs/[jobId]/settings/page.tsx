import Link from "next/link";
import { notFound } from "next/navigation";
import {
  hiring,
  type CompanyRow,
  type JobRow,
} from "@/lib/hiring";
import { Card, CardContent } from "@/components/ui/card";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { DeleteJobZone } from "./delete-job-zone";
import { ClientPicker } from "./client-picker";

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
