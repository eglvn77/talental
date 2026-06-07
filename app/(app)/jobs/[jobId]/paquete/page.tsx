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

  // Role Calibration History — manual entries for every client
  // conversation that shifted the brief. Eventually populated by
  // Slack/WhatsApp/email ingesters; today every row is recruiter-
  // authored. Newest first so the most recent calibration leads.
  const { data: feedbackRows } = await db
    .from("job_feedback_entries")
    .select("*")
    .eq("job_id", jobId)
    .order("received_at", { ascending: false });
  const feedbackEntries = (feedbackRows ?? []) as Array<{
    id: string;
    job_id: string;
    body: string;
    source: "manual" | "slack" | "whatsapp" | "call" | "email" | "other";
    received_at: string;
    recorded_by_team_member_id: string | null;
    created_at: string;
  }>;

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
        requirements={requirements}
        sourcing={sourcing}
        sequences={sequences}
        hiringProcess={hiringProcess}
        applicationQuestions={applicationQuestions}
        aiInterviewQuestions={aiInterviewQuestions}
        interviewScript={interviewScript}
        feedbackEntries={feedbackEntries}
      />
    </div>
  );
}
