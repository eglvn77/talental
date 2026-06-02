import { notFound } from "next/navigation";
import {
  hiring,
  type AIInterviewCategory,
  type ApplicationQuestion,
  type JobHiringProcessStep,
  type JobRequirements,
  type JobRow,
  type JobSourcing,
} from "@/lib/hiring";
import { EmptyState } from "@/app/(app)/_components/empty-state";
import { getT } from "@/lib/i18n/server";
import { PaqueteTabs, type SequenceWithSteps } from "./paquete-tabs";

export const dynamic = "force-dynamic";

/**
 * /jobs/[id]/paquete — the recruiter's internal dossier for a
 * vacante. Consolidates everything that used to live in four
 * separate tabs (Resumen, Requisitos, Búsqueda y Contacto,
 * Entrevistas) onto a single scrollable page so the reading flow
 * is "open the vacante → scan its full package in one pass" rather
 * than tab-hopping between fragments.
 *
 * Visual chrome is deliberately light: each block is just an inline
 * `<h2>` label + the existing editor — no card surrounds, no
 * collapsibles. Mirrors the "less section chrome" feedback on the
 * Publicación / Ajustes tabs.
 */
type SequenceStep = SequenceWithSteps["steps"][number];

export type ChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  phase: string;
  indent: 0 | 1;
};

/**
 * Parse hiring.tasks rows back into structured checklist items by
 * reading the marker comment kickoff persist writes into `body`:
 *   <!-- kickoff_checklist:v1 | phase: X | indent: Y -->
 * Anything without that marker is ignored (manual tasks).
 */
function parseChecklistTasks(
  rows: Array<{ id: string; title: string; status: string; body: string | null }>,
): ChecklistItem[] {
  const re =
    /kickoff_checklist:v1\s*\|\s*phase:\s*([^|]+?)\s*\|\s*indent:\s*([01])/;
  const items: ChecklistItem[] = [];
  for (const r of rows) {
    if (!r.body) continue;
    const m = r.body.match(re);
    if (!m) continue;
    items.push({
      id: r.id,
      title: r.title,
      done: r.status === "done",
      phase: m[1]!.trim(),
      indent: (Number(m[2]) as 0 | 1) ?? 0,
    });
  }
  return items;
}

export default async function JobPaquetePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const t = await getT();
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
          title={t("kickoff.emptyTitle")}
          description={t("kickoff.emptyDescription")}
          variant="dashed"
        />
      </div>
    );
  }

  const requirements =
    (job.requirements ?? { must: [], nice: [] }) as JobRequirements;
  const sourcing = (job.sourcing ?? null) as JobSourcing | null;
  const hiringProcess =
    (job.hiring_process ?? null) as JobHiringProcessStep[] | null;
  const applicationQuestions =
    (job.screening_questions as unknown as ApplicationQuestion[] | null) ??
    null;
  const aiInterviewQuestions =
    (job.interview_questions as unknown as AIInterviewCategory[] | null) ??
    null;
  const interviewScript =
    (job.interview_script as { markdown?: string } | null)?.markdown ?? null;

  // Kickoff checklist — surfaced as the first tab. We read the
  // hiring.tasks rows the kickoff persisted with the
  // "kickoff_checklist:v1" marker in `body`. The marker carries the
  // phase + indent so the UI can group items the same way the prompt
  // produced them. Tasks without the marker are out-of-scope here
  // (manual tasks belong in a future general "Tasks" view).
  const { data: taskRows } = await db
    .from("tasks")
    .select("id, title, status, body, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: true });
  const checklist = parseChecklistTasks(taskRows ?? []);

  // Outreach sequences attached to this vacante. Pulled here so the
  // SequenceEditor can mount inline at the bottom of the page —
  // mirrors the old /outreach query.
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
    <div className="mx-auto w-full max-w-4xl py-6">
      <PaqueteTabs
        jobId={job.id}
        checklist={checklist}
        requirements={requirements}
        sourcing={sourcing}
        sequences={sequences}
        hiringProcess={hiringProcess}
        applicationQuestions={applicationQuestions}
        aiInterviewQuestions={aiInterviewQuestions}
        interviewScript={interviewScript}
      />
    </div>
  );
}
