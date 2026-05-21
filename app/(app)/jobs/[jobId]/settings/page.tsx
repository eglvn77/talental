import { notFound } from "next/navigation";
import { hiring, type JobRow } from "@/lib/hiring";
import { Card, CardContent } from "@/components/ui/card";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { JobSettingsForm } from "./job-settings-form";
import { DeleteJobZone } from "./delete-job-zone";

export const dynamic = "force-dynamic";

export default async function RoleSettingsTab({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId: jobId } = await params;
  const { data } = await (await hiring())
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) notFound();
  const role = data as JobRow;

  const { definitions, valuesByDefId } = await loadCustomFieldsForEntity(
    "job",
    role.id,
  );

  return (
    <div className="space-y-5 py-4">
      <Card>
        <CardContent>
          <h2 className="mb-1 text-base font-semibold">Datos de la vacante</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Título, ubicación, rango salarial y descripción pública.
          </p>
          <JobSettingsForm
            role={role}
            mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
          />
        </CardContent>
      </Card>

      {definitions.length > 0 ? (
        <Card>
          <CardContent>
            <h2 className="mb-1 text-base font-semibold">
              Campos personalizados
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Definidos en{" "}
              <a
                href="/settings/custom-fields/job"
                className="underline hover:text-foreground"
              >
                Configuración → Campos personalizados → Vacantes
              </a>
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
