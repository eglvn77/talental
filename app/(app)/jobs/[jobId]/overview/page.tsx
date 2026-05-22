import { notFound } from "next/navigation";
import {
  hiring,
  type JobHiringProcessStep,
  type JobRow,
} from "@/lib/hiring";
import { CollapsibleSection } from "../_components/collapsible-section";
import { OverviewEditor } from "../_components/overview-editor";

export const dynamic = "force-dynamic";

export default async function JobOverviewPage({
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
  const job = data as JobRow;

  if (!job.overview) {
    return <EmptyState />;
  }

  const hiringProcess = (job.hiring_process ?? null) as
    | JobHiringProcessStep[]
    | null;

  return (
    <div className="space-y-3 py-4">
      <section className="rounded-md border border-border bg-card p-4">
        <OverviewEditor
          job={job}
          mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
        />
      </section>

      {hiringProcess && hiringProcess.length > 0 ? (
        <CollapsibleSection
          title="Proceso de Evaluación"
          rightSlot={
            <span className="text-[10px] text-muted-foreground">
              {hiringProcess.length} etapas
            </span>
          }
        >
          <ol className="space-y-2">
            {hiringProcess
              .slice()
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((stage, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px]">
                    {stage.order ?? i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{stage.who}</div>
                    <div className="text-xs text-muted-foreground">
                      {stage.focus}
                      {stage.format ? ` · ${stage.format}` : ""}
                    </div>
                  </div>
                </li>
              ))}
          </ol>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Edición inline próximamente.
          </p>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-10">
      <div className="mx-auto max-w-xl rounded-md border border-dashed border-border bg-card px-6 py-10 text-center">
        <h2 className="text-base font-semibold">Aún no hay Resumen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Corre el Kickoff con el botón en el header para popular esta sección.
        </p>
      </div>
    </div>
  );
}
