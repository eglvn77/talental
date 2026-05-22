import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  hiring,
  type CompanyRow,
  type JobRow,
} from "@/lib/hiring";
import { Card, CardContent } from "@/components/ui/card";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { DeleteJobZone } from "./delete-job-zone";

export const dynamic = "force-dynamic";

const COMING_SOON = [
  { label: "Stages del pipeline" },
  { label: "Tags" },
  { label: "Visibilidad" },
  { label: "Owners" },
];

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
          <h2 className="mb-3 text-base font-semibold">Cliente</h2>
          {company ? (
            <Link
              href={`/companies?company=${company.id}`}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <span className="font-medium">{company.name}</span>
              {company.domain ? (
                <span className="text-xs text-muted-foreground">
                  {company.domain}
                </span>
              ) : null}
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin cliente asignado.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            La edición del cliente y los datos de la vacante (título,
            modalidad, salario, fechas, idiomas, etc.) viven en el tab{" "}
            <Link
              href={`/jobs/${role.id}/setup`}
              className="underline hover:text-foreground"
            >
              Paquete
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

      <Card>
        <CardContent>
          <h2 className="mb-1 text-base font-semibold">Próximamente</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Estas configuraciones llegan en próximas iteraciones.
          </p>
          <ul className="space-y-1.5 text-sm">
            {COMING_SOON.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                {item.label}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

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
