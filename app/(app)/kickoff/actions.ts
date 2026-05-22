"use server";

import { revalidatePath } from "next/cache";
import {
  hiring,
  getRequestWorkspaceId,
  type CompanyRow,
  type JobRow,
  type PromptRow,
} from "@/lib/hiring";
import { isAuthenticated } from "@/lib/auth/session";
import { DEFAULT_MASTER_PROMPT } from "@/lib/kickoff/default-master-prompt";
import { buildUserMessage, generateKickoff } from "@/lib/kickoff/claude";
import { persistKickoff } from "@/lib/kickoff/persist";
import type {
  KickoffMaterials,
  KickoffOutput,
  KickoffRunKind,
  KickoffSetupAnswers,
} from "@/lib/kickoff/types";
import { formatSalaryRange } from "@/lib/format";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

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

export async function runKickoffAction(input: {
  jobId: string;
  materials: KickoffMaterials;
  setupAnswers: KickoffSetupAnswers;
  runKind: KickoffRunKind;
}): Promise<ActionResult<{ runId: string; conflicts: string[] }>> {
  if (!(await isAuthenticated())) {
    return { ok: false, error: "Unauthorized" };
  }

  // Validate minimal inputs.
  if (input.runKind === "kickoff" && !input.materials.intake_transcript.trim()) {
    return {
      ok: false,
      error: "La transcripción del intake call es requerida para el kickoff inicial.",
    };
  }
  if (input.setupAnswers.role_type !== "full_headhunting" && !input.setupAnswers.ai_process_language) {
    return {
      ok: false,
      error: "Falta el idioma del AI process para este tipo de rol.",
    };
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Load the job — we need title + company context for the user message
  // and to confirm the user has access to it under RLS.
  const { data: jobData, error: jobErr } = await db
    .from("jobs")
    .select("*")
    .eq("id", input.jobId)
    .maybeSingle();
  if (jobErr || !jobData) {
    return { ok: false, error: "Vacante no encontrada" };
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

  // Create the kickoff_runs row in 'pending' state upfront so we always
  // have an audit trail even if Claude fails or the request times out.
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
    return { ok: false, error: runErr?.message || "Failed to record run" };
  }
  const runId = runRow.id as string;

  const startedAt = Date.now();
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

    output = await generateKickoff({
      systemPrompt,
      userMessage,
      model,
    });
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
    return {
      ok: false,
      error: `Claude generation failed: ${msg.slice(0, 300)}`,
    };
  }

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
    return { ok: false, error: `Persistence failed: ${msg.slice(0, 300)}` };
  }

  // Also mirror the role_type from the dialog to the job if it wasn't set
  // there yet — the dialog is the canonical place to declare it.
  if (job.role_type !== input.setupAnswers.role_type) {
    await db
      .from("jobs")
      .update({ role_type: input.setupAnswers.role_type })
      .eq("id", input.jobId);
  }

  // Auto-promote Borrador → Activa now that the vacante has its full
  // content. Only touches status when it's still Borrador — never
  // overrides Activa, Por Cerrar, Cubierta, or Cancelada.
  if (job.status === "borrador") {
    await db
      .from("jobs")
      .update({
        status: "activa",
        published_at: new Date().toISOString(),
      })
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

  return {
    ok: true,
    data: { runId, conflicts: output.source_conflicts ?? [] },
  };
}
