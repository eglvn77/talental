import "server-only";

import { revalidatePath } from "next/cache";
import {
  hiring,
  getRequestWorkspaceId,
  type CompanyRow,
  type JobRow,
  type PromptRow,
} from "@/lib/hiring";
import { DEFAULT_MASTER_PROMPT } from "./default-master-prompt";
import { buildUserMessage, generateKickoffStreaming } from "./claude";
import { persistKickoff } from "./persist";
import type {
  KickoffMaterials,
  KickoffOutput,
  KickoffRunKind,
  KickoffSetupAnswers,
} from "./types";
import { formatSalaryRange } from "@/lib/format";

/**
 * Events emitted by `executeKickoffRun`. The SSE route handler
 * serializes these as `data:` lines; non-streaming callers can
 * collect the final `done` / `error` event for the result.
 */
export type KickoffRunEvent =
  | { type: "phase"; phase: KickoffPhase; message: string }
  | { type: "tokens"; chars: number }
  | { type: "done"; runId: string; conflicts: string[] }
  | { type: "error"; error: string };

export type KickoffPhase =
  | "context"
  | "generating"
  | "validating"
  | "persisting"
  | "side_effects";

const KICKOFF_PROMPT_KEY = "kickoff_master";

async function loadPromptBody(workspaceId: string): Promise<{
  body: string;
  model: string;
}> {
  const db = await hiring();
  const { data } = await db
    .from("prompts")
    .select("body, model")
    .eq("workspace_id", workspaceId)
    .eq("key", KICKOFF_PROMPT_KEY)
    .maybeSingle();
  const row = data as Pick<PromptRow, "body" | "model"> | null;
  if (row?.body) {
    return { body: row.body, model: row.model || "claude-sonnet-4-5" };
  }
  return { body: DEFAULT_MASTER_PROMPT, model: "claude-sonnet-4-5" };
}

function describeLocation(job: JobRow): string | null {
  if (!job.location) return null;
  const modality =
    job.work_modality === "remote"
      ? "remoto"
      : job.work_modality === "hybrid"
        ? "híbrido"
        : job.work_modality === "onsite"
          ? "presencial"
          : null;
  return modality ? `${job.location} (${modality})` : job.location;
}

function describeWorkModality(job: JobRow): string | null {
  if (!job.work_modality) return null;
  return job.work_modality === "remote"
    ? "Remote"
    : job.work_modality === "hybrid"
      ? "Hybrid"
      : "On-site";
}

/**
 * Run the kickoff end-to-end while emitting phase events. The caller
 * is responsible for auth (we trust this is only invoked from a
 * route/action that already validated the session).
 *
 * Pulled out of the old `runKickoffAction` so the SSE route handler
 * and any future non-streaming caller share the same body.
 */
export async function executeKickoffRun(
  input: {
    jobId: string;
    materials: KickoffMaterials;
    setupAnswers: KickoffSetupAnswers;
    runKind: KickoffRunKind;
  },
  emit: (event: KickoffRunEvent) => void,
): Promise<void> {
  // Validate minimal inputs.
  if (input.runKind === "kickoff" && !input.materials.intake_transcript.trim()) {
    emit({
      type: "error",
      error:
        "La transcripción del intake call es requerida para el kickoff inicial.",
    });
    return;
  }
  if (
    input.setupAnswers.role_type !== "full_headhunting" &&
    !input.setupAnswers.ai_process_language
  ) {
    emit({
      type: "error",
      error: "Falta el idioma del AI process para este tipo de rol.",
    });
    return;
  }

  emit({ type: "phase", phase: "context", message: "Cargando contexto…" });

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: jobData, error: jobErr } = await db
    .from("jobs")
    .select("*")
    .eq("id", input.jobId)
    .maybeSingle();
  if (jobErr || !jobData) {
    emit({ type: "error", error: "Vacante no encontrada" });
    return;
  }
  const job = jobData as JobRow;

  let company: CompanyRow | null = null;
  if (job.company_id) {
    const { data: c } = await db
      .from("companies")
      .select("*")
      .eq("id", job.company_id)
      .maybeSingle();
    company = (c ?? null) as CompanyRow | null;
  }

  const { body: systemPrompt, model } = await loadPromptBody(workspaceId);

  const { data: runRow, error: runErr } = await db
    .from("kickoff_runs")
    .insert({
      workspace_id: workspaceId,
      job_id: input.jobId,
      run_kind: input.runKind,
      setup_answers: input.setupAnswers as unknown as Record<string, unknown>,
      materials: input.materials as unknown as Record<string, unknown>,
      model,
      status: "pending",
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    emit({ type: "error", error: runErr?.message || "Failed to record run" });
    return;
  }
  const runId = runRow.id as string;

  const startedAt = Date.now();

  emit({
    type: "phase",
    phase: "generating",
    message: "Generando con Claude…",
  });

  let output: KickoffOutput;
  try {
    const userMessage = buildUserMessage({
      jobTitle: job.title,
      companyName: company?.name ?? null,
      locationLabel: describeLocation(job),
      salarySummary: formatSalaryRange(
        job.salary_min,
        job.salary_max,
        job.salary_currency,
        job.salary_type,
        job.salary_frequency,
      ),
      workModalityLabel: describeWorkModality(job),
      setupAnswers: input.setupAnswers,
      materials: input.materials,
      runKind: input.runKind,
    });

    output = await generateKickoffStreaming(
      { systemPrompt, userMessage, model },
      (chars) => emit({ type: "tokens", chars }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .from("kickoff_runs")
      .update({
        status: "failed",
        error_message: msg.slice(0, 1000),
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", runId);
    emit({
      type: "error",
      error: `Claude generation failed: ${msg.slice(0, 300)}`,
    });
    return;
  }

  emit({
    type: "phase",
    phase: "validating",
    message: "Validando estructura…",
  });
  // Validation is inside persistKickoff (parseKickoffOutput) — we emit
  // the phase so the user sees a beat between Claude finishing and the
  // DB writes starting.

  emit({ type: "phase", phase: "persisting", message: "Guardando…" });

  try {
    await persistKickoff({
      jobId: input.jobId,
      jobTitle: job.title,
      output,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .from("kickoff_runs")
      .update({
        status: "failed",
        error_message: `Persist: ${msg}`.slice(0, 1000),
        output: output as unknown as Record<string, unknown>,
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", runId);
    emit({ type: "error", error: `Persistence failed: ${msg.slice(0, 300)}` });
    return;
  }

  emit({
    type: "phase",
    phase: "side_effects",
    message: "Ajustando estatus…",
  });

  // Mirror role_type onto the job, persist assessment link if any.
  const sideEffectsPatch: Record<string, unknown> = {};
  if (job.role_type !== input.setupAnswers.role_type) {
    sideEffectsPatch.role_type = input.setupAnswers.role_type;
  }
  if (input.materials.assessment_link !== undefined) {
    sideEffectsPatch.assessment_link =
      input.materials.assessment_link.trim() || null;
  }
  if (Object.keys(sideEffectsPatch).length > 0) {
    await db.from("jobs").update(sideEffectsPatch).eq("id", input.jobId);
  }

  // Auto-promote Borrador → Activa + seed open_date.
  if (job.status === "borrador") {
    const today = new Date().toISOString().slice(0, 10);
    await db
      .from("jobs")
      .update({
        status: "activa",
        published_at: new Date().toISOString(),
        ...(job.open_date ? {} : { open_date: today }),
      })
      .eq("id", input.jobId);
  } else if (!job.open_date) {
    const today = new Date().toISOString().slice(0, 10);
    await db
      .from("jobs")
      .update({ open_date: today })
      .eq("id", input.jobId);
  }

  await db
    .from("kickoff_runs")
    .update({
      status: "success",
      output: output as unknown as Record<string, unknown>,
      duration_ms: Date.now() - startedAt,
    })
    .eq("id", runId);

  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath(`/jobs/${input.jobId}/settings`);

  emit({
    type: "done",
    runId,
    conflicts: output.source_conflicts ?? [],
  });
}
