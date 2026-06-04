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
import {
  SOP_TEMPLATE,
  SOP_MARKER_PREFIX,
  sopMarker,
} from "@/lib/sop/template";
import type { SopTaskRow } from "../_components/sop";

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

/**
 * Parse hiring.tasks rows tagged with the SOP marker
 *   <!-- sop:v1 | item: ITEM_ID -->
 * into a flat map keyed by template-item-id. Anything without the
 * marker is ignored — both manual tasks AND legacy
 * `kickoff_checklist:v1` rows (we let those orphan rather than
 * delete them, since some workspaces may still want that data).
 */
function parseSopTasks(
  rows: Array<{ id: string; status: string; body: string | null }>,
): Record<string, SopTaskRow> {
  const re = new RegExp(
    `${SOP_MARKER_PREFIX}\\s*\\|\\s*item:\\s*([a-z0-9-]+)`,
    "i",
  );
  const out: Record<string, SopTaskRow> = {};
  for (const r of rows) {
    if (!r.body) continue;
    const m = r.body.match(re);
    if (!m) continue;
    const itemId = m[1]!.trim();
    out[itemId] = {
      id: r.id,
      itemId,
      done: r.status === "done",
    };
  }
  return out;
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

  // SOP — Talental's company-wide playbook surfaced as the first
  // tab. Items come from the static template in lib/sop/template.ts;
  // checked-state lives per-job in hiring.tasks via the `sop:v1`
  // marker. On first load we lazy-seed any missing item so toggles
  // always have a row to flip.
  const { data: taskRows } = await db
    .from("tasks")
    .select("id, status, body, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: true });
  let sopRowsByItemId = parseSopTasks(taskRows ?? []);
  const missingItems = SOP_TEMPLATE.filter((it) => !sopRowsByItemId[it.id]);
  if (missingItems.length > 0) {
    // Seed rows for every template item this vacante doesn't have
    // yet. workspace_id comes off the job (RLS would have rejected
    // the read otherwise). Status defaults to "open"; toggling later
    // flips it to "done" via toggleSopItemAction.
    const seedPayload = missingItems.map((it) => ({
      workspace_id: job.workspace_id,
      title: it.labelEn, // canonical English label; UI shows localized
      body: sopMarker(it.id),
      status: "open" as const,
      priority: "normal" as const,
      entity_type: "job" as const,
      entity_id: jobId,
    }));
    const { data: inserted } = await db
      .from("tasks")
      .insert(seedPayload)
      .select("id, status, body");
    if (inserted) {
      sopRowsByItemId = {
        ...sopRowsByItemId,
        ...parseSopTasks(
          inserted as Array<{ id: string; status: string; body: string | null }>,
        ),
      };
    }
  }

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
        sopRowsByItemId={sopRowsByItemId}
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
