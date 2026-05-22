import { notFound } from "next/navigation";
import { ExternalLink, Mail, Linkedin, MessageSquare } from "lucide-react";
import {
  hiring,
  type JobRow,
  type JobRequirements,
} from "@/lib/hiring";
import { CollapsibleSection } from "./collapsible-section";
import { PaqueteOverviewEditor } from "./paquete-overview-editor";

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

const CHANNEL_LABEL: Record<string, { label: string; Icon: typeof Mail }> = {
  email: { label: "Email", Icon: Mail },
  linkedin_invitation: { label: "LinkedIn Invitation", Icon: Linkedin },
  linkedin_inmail: { label: "LinkedIn InMail", Icon: Linkedin },
  linkedin_message: { label: "LinkedIn Message", Icon: MessageSquare },
};

function describeDelay(minutes: number | null): string {
  if (!minutes) return "Inmediato";
  const hours = Math.round(minutes / 60);
  if (hours === 0) return `+${minutes} min`;
  if (hours < 24) return `+${hours}h`;
  const days = Math.round(hours / 24);
  return `+${days}d`;
}

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
        <PaqueteOverviewEditor job={job} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Requisitos"
        rightSlot={
          <span className="text-[10px] text-muted-foreground">
            {requirements.must.length} obligatorios ·{" "}
            {requirements.nice.length} deseables
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Imprescindibles
            </h3>
            {requirements.must.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="list-disc pl-5 text-sm">
                {requirements.must.map((m, i) => (
                  <li key={i} className="mb-1">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Suma puntos
            </h3>
            {requirements.nice.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="list-disc pl-5 text-sm">
                {requirements.nice.map((m, i) => (
                  <li key={i} className="mb-1">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          La edición detallada de requisitos llega en la próxima iteración.
        </p>
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
          {sequences.map((seq) => (
            <div key={seq.id} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">{seq.name}</span>
                <span>
                  {seq.status} ·{" "}
                  {new Date(seq.created_at).toLocaleDateString("es-MX")}
                </span>
              </div>
              <ol className="space-y-3">
                {seq.steps.map((step) => {
                  const channelKey =
                    (step.config?.channel as string | undefined) ?? step.kind;
                  const meta =
                    CHANNEL_LABEL[channelKey] ??
                    CHANNEL_LABEL[step.kind] ?? {
                      label: step.kind,
                      Icon: Mail,
                    };
                  const Icon = meta.Icon;
                  const body =
                    step.body_template ?? step.task_body ?? "(vacío)";
                  return (
                    <li
                      key={step.id}
                      className="rounded-md border border-border bg-background p-3"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {step.position}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        <span className="text-muted-foreground">
                          {describeDelay(step.delay_minutes)}
                        </span>
                        {step.subject_template ? (
                          <span className="truncate text-muted-foreground">
                            · <em>{step.subject_template}</em>
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {body}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
          <p className="mt-3 text-[10px] text-muted-foreground">
            La edición inline de cada mensaje llega en la próxima iteración.
          </p>
        </CollapsibleSection>
      ) : null}

      {job.linkedin_post ? (
        <CollapsibleSection title="Post de LinkedIn">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {job.linkedin_post}
          </pre>
        </CollapsibleSection>
      ) : null}

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
