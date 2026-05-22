import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  hiring,
  type JobRow,
  type JobRequirements,
} from "@/lib/hiring";
import { CollapsibleSection } from "./collapsible-section";
import { PaqueteOverviewEditor } from "./paquete-overview-editor";
import { RequirementsEditor } from "./requirements-editor";
import { SequenceEditor } from "./sequence-editor";
import { LinkedinPostEditor } from "./linkedin-post-editor";

export const dynamic = "force-dynamic";

type SequenceStep = {
  id: string;
  position: number;
  kind: string;
  delay_minutes: number | null;
  subject_template: string | null;
  body_template: string | null;
  task_title: string | null;
  task_body: string | null;
  config: { channel?: string } | null;
};

type SequenceWithSteps = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  steps: SequenceStep[];
};

export default async function JobPaquetePage({
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

  const hasContent = Boolean(job.overview);

  if (!hasContent) {
    return (
      <div className="py-10">
        <div className="mx-auto max-w-xl rounded-md border border-dashed border-border bg-card px-6 py-10 text-center">
          <h2 className="text-base font-semibold">Aún no hay Paquete</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Corre el Kickoff con el botón en el header para popular el
            paquete (resumen, requisitos, secuencia de contacto, post de
            LinkedIn y checklist).
          </p>
        </div>
      </div>
    );
  }

  // Fetch outreach sequences for this job.
  const { data: seqRows } = await db
    .from("sequences")
    .select("id, name, status, created_at")
    .eq("default_job_id", jobId)
    .order("created_at", { ascending: false });
  const sequenceShells = (seqRows ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }>;

  let sequences: SequenceWithSteps[] = [];
  if (sequenceShells.length > 0) {
    const seqIds = sequenceShells.map((s) => s.id);
    const { data: stepRows } = await db
      .from("sequence_steps")
      .select("*")
      .in("sequence_id", seqIds)
      .order("position", { ascending: true });
    const allSteps = (stepRows ?? []) as Array<
      SequenceStep & { sequence_id: string }
    >;
    sequences = sequenceShells.map((s) => ({
      ...s,
      steps: allSteps.filter((st) => st.sequence_id === s.id),
    }));
  }

  const requirements = (job.requirements ?? { must: [], nice: [] }) as JobRequirements;

  return (
    <div className="space-y-3 py-4">
      <CollapsibleSection title="Resumen" defaultOpen>
        <PaqueteOverviewEditor
          job={job}
          mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Requisitos"
        rightSlot={
          <span className="text-[10px] text-muted-foreground">
            {requirements.must.length} imprescindibles ·{" "}
            {requirements.nice.length} deseables
          </span>
        }
      >
        <RequirementsEditor jobId={job.id} initial={requirements} />
      </CollapsibleSection>

      {sequences.length > 0 ? (
        <CollapsibleSection
          title="Secuencia de contacto"
          rightSlot={
            <span className="text-[10px] text-muted-foreground">
              {sequences[0].steps.length} pasos ·{" "}
              {sequences.length > 1
                ? `${sequences.length} versiones`
                : "1 versión"}
            </span>
          }
        >
          <SequenceEditor sequences={sequences} />
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection title="Post de LinkedIn">
        <LinkedinPostEditor jobId={job.id} initial={job.linkedin_post ?? ""} />
      </CollapsibleSection>

      {job.assessment_content ? (
        <CollapsibleSection title="Assessment">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {job.assessment_content}
          </pre>
          {job.assessment_link ? (
            <a
              href={job.assessment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-foreground hover:underline"
            >
              Abrir link del assessment <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
