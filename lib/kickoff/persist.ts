import "server-only";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { sanitizeRichText } from "@/app/(app)/_components/sanitize-html";
import type { KickoffOutput } from "./types";
import { parseKickoffOutput } from "./validation";
import { upsertResourceValue } from "./resource-values";

/**
 * Persist a kickoff package across hiring.jobs, hiring.sequences,
 * hiring.sequence_steps, and hiring.tasks. RLS handles workspace
 * scoping; the caller has already validated the user and the job.
 *
 * Calibration runs APPEND to sequences and tasks (Phase 1 behavior).
 * The recruiter can archive the previous sequence and mark old tasks
 * cancelled from the UI. We can add a "replace previous kickoff" toggle
 * later if accumulation becomes annoying.
 */

const KICKOFF_CHECKLIST_MARKER = "kickoff_checklist:v1";

/** Map the AI-friendly channel name to the DB sequence_step_kind enum. */
function mapChannelToKind(channel: string): {
  kind: "email" | "linkedin_message" | "manual_task";
  task_title?: string;
} {
  switch (channel) {
    case "email":
      return { kind: "email" };
    case "linkedin_message":
      return { kind: "linkedin_message" };
    case "linkedin_invitation":
      return {
        kind: "manual_task",
        task_title: "Send LinkedIn connection request",
      };
    case "linkedin_inmail":
      return { kind: "manual_task", task_title: "Send LinkedIn InMail" };
    default:
      return { kind: "manual_task", task_title: `Step (${channel})` };
  }
}

export async function persistKickoff(input: {
  jobId: string;
  jobTitle: string;
  /**
   * The vacante's current free-text location, if any. When blank and
   * the package inferred an office_location, we backfill `jobs.location`
   * — this powers the intake-first create flow where the recruiter
   * never typed a location. Never overwrites a location the user set.
   */
  currentLocation?: string | null;
  /** Current structured columns — backfilled only when blank/null. */
  currentWorkModality?: string | null;
  currentContractType?: string | null;
  currentWorkingHours?: string | null;
  currentSalaryMin?: number | null;
  currentSalaryMax?: number | null;
  output: KickoffOutput;
}): Promise<void> {
  // Validate the AI payload before touching the DB. Throws on shape
  // drift — caller (runKickoffAction) records the error in
  // hiring.kickoff_runs.error and surfaces it as a toast.
  const parsed = parseKickoffOutput(input.output);
  input = { ...input, output: parsed };
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Intake-first backfill: when the recruiter created the vacante from
  // just the intake, `title`/`location` are blank and the model infers
  // them. We only ever FILL blanks — a title or location the recruiter
  // typed is never overwritten.
  const inferredTitle = (input.output.job_title ?? "").trim();
  const titleIsBlank = !input.jobTitle.trim();
  const inferredLocation = (input.output.overview?.office_location ?? "").trim();
  const locationIsBlank = !(input.currentLocation ?? "").trim();
  const locationIsReal =
    inferredLocation.length > 0 && !/^(tbd|n\/?a|por definir)$/i.test(inferredLocation);

  // Structured facts → job columns, only-if-blank (never overwrite what
  // the recruiter set on the create form).
  const facts = input.output.structured_facts ?? {};
  const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
  const PERIOD_TO_FREQ: Record<string, string> = {
    monthly: "monthly",
    annual: "annual",
    weekly: "weekly",
    hourly: "hourly",
  };
  const CONTRACTS = ["permanent", "temporary", "contractor", "internship"] as const;
  const HOURS = ["full_time", "part_time", "flexible"] as const;
  const structuredPatch: Record<string, unknown> = {};
  if (
    !(input.currentWorkModality ?? "").trim() &&
    typeof facts.work_modality === "string" &&
    (WORK_MODES as readonly string[]).includes(facts.work_modality)
  ) {
    structuredPatch.work_modality = facts.work_modality;
  }
  if (
    !(input.currentContractType ?? "").trim() &&
    typeof facts.contract_type === "string" &&
    (CONTRACTS as readonly string[]).includes(facts.contract_type)
  ) {
    structuredPatch.contract_type = facts.contract_type;
  }
  if (
    !(input.currentWorkingHours ?? "").trim() &&
    typeof facts.working_hours === "string" &&
    (HOURS as readonly string[]).includes(facts.working_hours)
  ) {
    structuredPatch.working_hours = facts.working_hours;
  }
  const salaryIsBlank =
    input.currentSalaryMin == null && input.currentSalaryMax == null;
  if (
    salaryIsBlank &&
    (typeof facts.salary_min === "number" || typeof facts.salary_max === "number")
  ) {
    if (typeof facts.salary_min === "number")
      structuredPatch.salary_min = facts.salary_min;
    if (typeof facts.salary_max === "number")
      structuredPatch.salary_max = facts.salary_max;
    const cur = (facts.salary_currency ?? "").trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(cur)) structuredPatch.salary_currency = cur;
    const freq = facts.salary_period ? PERIOD_TO_FREQ[facts.salary_period] : null;
    if (freq) structuredPatch.salary_frequency = freq;
  }

  // 1. Update jobs with the generated content. public_description gets
  //    sanitized — Claude returns HTML targeted at Tiptap.
  //
  // The 6 dossier sections (requirements / sourcing / hiring_process /
  // application_questions / ai_interview_questions / talental_interview_
  // script) are NOT written to jobs columns anymore — they go through
  // hiring.resource_values further down, and the mirror-back trigger
  // updates the legacy columns inside the same statement.
  //
  // The columns that remain on this update either have no resource
  // counterpart (public_description, overview JSONB, linkedin_post,
  // assessment_content, the structured patch) or are intake-blank
  // backfills (title / location).
  const ov = input.output.overview ?? {};
  const { error: jobErr } = await db
    .from("jobs")
    .update({
      public_description: sanitizeRichText(input.output.jd_public_description),
      overview: input.output.overview,
      linkedin_post: null,
      assessment_content: input.output.assessment_content || null,
      // Typed columns mirrored from overview JSONB so the editable Paquete
      // UI works against proper columns, not opaque jsonb.
      //
      // NOTE: `language_requirements` and `target_start_date` were dropped
      // from hiring.jobs in 20260525070000 (they had no reader after
      // OverviewEditor was retired). They survive in `overview` JSONB
      // for the AI-generated package; do NOT write them as columns or
      // PostgREST throws "Could not find the column" against the cache.
      compensation_detail: ov.compensation_detail || null,
      // NOTE: contract_type / working_hours are ENUM-backed columns the
      // posting editor + careers chips read. We do NOT write the model's
      // descriptive overview text here (it produced long essays that
      // rendered as giant chips). The clean enum codes come from
      // structuredPatch below (only-if-blank); the descriptive text stays
      // in the `overview` JSONB for reference.
      internal_notes: ov.notes || null,
      // Backfill title/location only when the vacante had none (intake-
      // first flow). Free-text location — no Google place_id — which the
      // jobs update path explicitly allows.
      ...(titleIsBlank && inferredTitle ? { title: inferredTitle } : {}),
      ...(locationIsBlank && locationIsReal ? { location: inferredLocation } : {}),
      ...structuredPatch,
    })
    .eq("id", input.jobId);
  if (jobErr) {
    throw new Error(`Failed to update job: ${jobErr.message}`);
  }

  // 1b. Resource values for the 6 dossier sections. Each goes through
  //     upsertResourceValue → mirror-back trigger updates the legacy
  //     column. Order matches the seeded definition `position` so the
  //     audit timestamps line up with the on-screen order.
  const resourceRows: Array<{
    key: Parameters<typeof upsertResourceValue>[0]["key"];
    value: unknown;
  }> = [
    { key: "requirements", value: input.output.requirements ?? null },
    { key: "sourcing", value: input.output.sourcing ?? null },
    { key: "hiring_process", value: input.output.hiring_process ?? null },
    {
      key: "application_questions",
      value: input.output.application_questions ?? null,
    },
    {
      key: "ai_interview_questions",
      value: input.output.ai_interview_questions ?? null,
    },
    {
      // jsonb STRING (kind=markdown). Trigger wraps as {markdown: <text>}
      // when mirroring back to jobs.interview_script.
      key: "talental_interview_script",
      value: input.output.talental_interview_script ?? null,
    },
  ];
  for (const r of resourceRows) {
    await upsertResourceValue({
      db,
      workspaceId,
      jobId: input.jobId,
      key: r.key,
      value: r.value,
      generatedBy: "ai_kickoff",
    });
  }

  // 2. Outreach sequence (only when present).
  if (input.output.outreach_sequence && input.output.outreach_sequence.length > 0) {
    const { data: seq, error: seqErr } = await db
      .from("sequences")
      .insert({
        workspace_id: workspaceId,
        name: `${input.jobTitle.trim() || inferredTitle || "Outreach"} — Outreach`,
        description:
          "Generated by Kickoff. Refine and activate manually before launching.",
        status: "draft",
        target_entity_type: "candidate",
        default_job_id: input.jobId,
      })
      .select("id")
      .single();
    if (seqErr || !seq) {
      throw new Error(`Failed to create sequence: ${seqErr?.message}`);
    }

    const stepsPayload = input.output.outreach_sequence.map((s) => {
      const mapped = mapChannelToKind(s.channel);
      return {
        workspace_id: workspaceId,
        sequence_id: seq.id as string,
        position: s.step,
        kind: mapped.kind,
        delay_minutes: s.delay_hours * 60,
        subject_template: s.subject ?? null,
        body_template: s.body ?? null,
        task_title: mapped.task_title ?? null,
        task_body:
          mapped.task_title && s.body ? s.body : null,
        config: { channel: s.channel },
      };
    });

    const { error: stepsErr } = await db
      .from("sequence_steps")
      .insert(stepsPayload);
    if (stepsErr) {
      throw new Error(`Failed to create sequence steps: ${stepsErr.message}`);
    }
  }

  // 3. Kickoff checklist as tasks.
  if (
    input.output.kickoff_checklist &&
    input.output.kickoff_checklist.length > 0
  ) {
    const tasksPayload = input.output.kickoff_checklist.map((item) => ({
      workspace_id: workspaceId,
      title: item.item,
      // Marker in the body lets us filter / clean up kickoff-generated
      // tasks separately from manually created ones in a later phase.
      body: `<!-- ${KICKOFF_CHECKLIST_MARKER} | phase: ${item.phase} | indent: ${item.indent} -->`,
      status: "open" as const,
      priority: "normal" as const,
      entity_type: "job" as const,
      entity_id: input.jobId,
    }));

    const { error: tasksErr } = await db.from("tasks").insert(tasksPayload);
    if (tasksErr) {
      throw new Error(`Failed to create kickoff tasks: ${tasksErr.message}`);
    }
  }
}
