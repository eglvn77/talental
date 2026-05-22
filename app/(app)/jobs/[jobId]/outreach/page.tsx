import { notFound } from "next/navigation";
import {
  hiring,
  type JobRow,
  type JobSourcing,
} from "@/lib/hiring";
import { CollapsibleSection } from "../_components/collapsible-section";
import { SourcingEditor } from "../_components/sourcing-editor";
import { SequenceEditor } from "../_components/sequence-editor";
import { EmptyState } from "@/app/(app)/_components/empty-state";

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

export default async function JobOutreachPage({
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
    return (
      <div className="py-10">
        <EmptyState
          title="Aún no hay sourcing ni outreach"
          description="Corre el Kickoff para generar las guías de búsqueda y la secuencia de contacto."
          variant="dashed"
        />
      </div>
    );
  }

  const sourcing = (job.sourcing ?? null) as JobSourcing | null;

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

  return (
    <div className="space-y-3 py-4">
      {sourcing ? (
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Sourcing Guidelines
          </h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            {sourcing.criteria.length} criteria ·{" "}
            {sourcing.questions.length} questions ·{" "}
            {sourcing.target_companies.length} target companies
          </p>
          <SourcingEditor jobId={job.id} initial={sourcing} />
        </section>
      ) : (
        <section className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          Sourcing Guidelines no aplica para vacantes de tipo Inbound AI
          Driven.
        </section>
      )}

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
    </div>
  );
}
