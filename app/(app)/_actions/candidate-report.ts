"use server";

import { revalidatePath } from "next/cache";
import { hiring } from "@/lib/hiring";
import { requireCurrentTeamMember } from "@/lib/auth/team";
import {
  generateCandidateReport,
  type ReportInput,
  type ReportInputTranscript,
} from "@/lib/candidate-report/generate";
import { renderReportMarkdown } from "@/lib/candidate-report/render";
import type { CandidateReportStruct } from "@/lib/candidate-report/types";
import { type ActionResult } from "./_shared";

/**
 * Generate (or re-generate) the AI candidate report for a single
 * application. Loads inputs, calls Claude with the workspace's
 * candidate_report prompt, renders the struct to markdown, and
 * persists alongside provenance metadata.
 *
 * Refuses to run when there's nothing to base the report on (no
 * transcript, no CV, no parsed_profile). The prompt itself handles
 * weak-signal cases (e.g. only a CV, no transcripts) by capping the
 * rating at lean_no.
 */

type GenerateOk = {
  rating: string;
  inserted_at: string;
  inputs_summary: {
    transcripts: number;
    cv: boolean;
    enrichment: boolean;
  };
};

export async function generateCandidateReportAction(input: {
  applicationId: string;
}): Promise<ActionResult<GenerateOk>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;

  const db = await hiring();

  // 1. Load the application + nested candidate + job.
  const { data: appRow, error: appErr } = await db
    .from("applications")
    .select(
      `
      id, candidate_id, job_id, workspace_id,
      candidate:candidates(
        id, full_name, email, linkedin_url, location,
        current_position, current_company_name,
        resume_text, parsed_profile
      ),
      job:jobs(
        id, title, work_modality, requirements,
        salary_min, salary_max, salary_currency, salary_frequency
      )
      `,
    )
    .eq("id", input.applicationId)
    .maybeSingle();
  if (appErr || !appRow) {
    return {
      ok: false,
      error: `Application not found: ${appErr?.message ?? "no row"}`,
    };
  }
  const app = appRow as unknown as {
    id: string;
    candidate_id: string;
    job_id: string;
    workspace_id: string;
    candidate: {
      id: string;
      full_name: string;
      email: string | null;
      linkedin_url: string | null;
      location: string | null;
      current_position: string | null;
      current_company_name: string | null;
      resume_text: string | null;
      parsed_profile: unknown | null;
    } | null;
    job: {
      id: string;
      title: string;
      work_modality: string | null;
      requirements: unknown | null;
      salary_min: number | null;
      salary_max: number | null;
      salary_currency: string | null;
      salary_frequency: string | null;
    } | null;
  };
  if (!app.candidate || !app.job) {
    return { ok: false, error: "Application missing candidate or job" };
  }

  // 2. Transcripts linked to this application.
  const { data: transcriptRows } = await db
    .from("interview_transcripts")
    .select("id, title, recorded_at, transcript")
    .eq("application_id", input.applicationId)
    .order("recorded_at", { ascending: true });
  const transcripts: ReportInputTranscript[] = (transcriptRows ?? []).map(
    (r) => {
      const row = r as {
        id: string;
        title: string | null;
        recorded_at: string | null;
        transcript: string;
      };
      return {
        id: row.id,
        title: row.title,
        recorded_at: row.recorded_at,
        text: row.transcript,
      };
    },
  );

  // 3. Validate we have enough inputs to generate anything useful.
  const cvText = app.candidate.resume_text?.trim() || null;
  const parsedProfile = app.candidate.parsed_profile;
  const hasEnrichment = parsedProfile && typeof parsedProfile === "object";
  if (transcripts.length === 0 && !cvText && !hasEnrichment) {
    return {
      ok: false,
      error:
        "Sin info para generar reporte. Necesitas al menos un transcript de entrevista, un CV, o enriquecer el perfil (Coresignal).",
    };
  }

  // 4. Resolve the workspace's default candidate_report prompt.
  const { data: promptRow, error: promptErr } = await db
    .from("prompts")
    .select("body, model")
    .eq("workspace_id", app.workspace_id)
    .eq("category", "candidate_report")
    .eq("is_default", true)
    .maybeSingle();
  if (promptErr || !promptRow) {
    return {
      ok: false,
      error: `No default candidate_report prompt for this workspace: ${promptErr?.message ?? "no row"}`,
    };
  }
  const prompt = promptRow as { body: string; model: string | null };

  // 5. Build summaries that go into the user message.
  const requirementsText = formatRequirements(app.job.requirements);
  const salarySummary = formatSalary(
    app.job.salary_min,
    app.job.salary_max,
    app.job.salary_currency,
    app.job.salary_frequency,
  );
  const profileSummary = formatParsedProfile(parsedProfile);

  const generateInput: ReportInput = {
    systemPrompt: prompt.body,
    model: prompt.model ?? undefined,
    job: {
      title: app.job.title,
      requirements_text: requirementsText,
      work_modality: app.job.work_modality,
      salary_summary: salarySummary,
    },
    candidate: {
      name: app.candidate.full_name,
      current_title: app.candidate.current_position,
      current_company: app.candidate.current_company_name,
      location: app.candidate.location,
      email: app.candidate.email,
      linkedin_url: app.candidate.linkedin_url,
    },
    transcripts,
    cv_text: cvText,
    parsed_profile_summary: profileSummary,
  };

  // 6. Call Claude.
  const genRes = await generateCandidateReport(generateInput);
  if (!genRes.ok) {
    return { ok: false, error: genRes.error };
  }

  // 7. Render + persist.
  const markdown = renderReportMarkdown(genRes.struct);
  const inputProvenance = {
    transcripts_used: transcripts.map((t) => ({
      id: t.id,
      title: t.title ?? "",
    })),
    cv_used: Boolean(cvText),
    enrichment_used: Boolean(hasEnrichment),
    prompt_key: "candidate_report_master",
    generated_struct: genRes.struct,
  };
  const now = new Date().toISOString();
  const { error: updateErr } = await db
    .from("applications")
    .update({
      candidate_report: markdown,
      report_generated_at: now,
      report_model: genRes.model,
      report_inputs: inputProvenance as never,
      // Reset edited_at — fresh generation, no manual overrides yet.
      report_edited_at: null,
    })
    .eq("id", input.applicationId);
  if (updateErr) {
    return { ok: false, error: `Update failed: ${updateErr.message}` };
  }

  revalidatePath("/candidates");
  revalidatePath(`/jobs/${app.job_id}`);

  return {
    ok: true,
    data: {
      rating: genRes.struct.overall_rating,
      inserted_at: now,
      inputs_summary: {
        transcripts: transcripts.length,
        cv: Boolean(cvText),
        enrichment: Boolean(hasEnrichment),
      },
    },
  };
}

/**
 * Save manual edits to the report and mark report_edited_at so the
 * UI knows to confirm before re-generating (and overwriting the
 * recruiter's tweaks).
 */
export async function acceptManualEditAction(input: {
  applicationId: string;
  markdown: string;
}): Promise<ActionResult<{ edited_at: string }>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const db = await hiring();
  const now = new Date().toISOString();
  const { error } = await db
    .from("applications")
    .update({
      candidate_report: input.markdown,
      report_edited_at: now,
    })
    .eq("id", input.applicationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { edited_at: now } };
}

// ── helpers ─────────────────────────────────────────────────

function formatRequirements(req: unknown): string | null {
  if (!req || typeof req !== "object") return null;
  // hiring.jobs.requirements is jsonb — best-effort flatten. Most
  // workspaces store it as an array of {label, must_have} or a free
  // string; tolerate both.
  if (Array.isArray(req)) {
    const items = (req as unknown[])
      .map((r) => {
        if (typeof r === "string") return `- ${r}`;
        if (r && typeof r === "object") {
          const obj = r as Record<string, unknown>;
          const label = typeof obj.label === "string" ? obj.label : null;
          const must = obj.must_have === true ? " (must)" : "";
          return label ? `- ${label}${must}` : null;
        }
        return null;
      })
      .filter((s): s is string => Boolean(s));
    return items.length > 0 ? items.join("\n") : null;
  }
  if (typeof req === "string") return req;
  try {
    return JSON.stringify(req, null, 2);
  } catch {
    return null;
  }
}

function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
  period: string | null,
): string | null {
  if (min == null && max == null) return null;
  const range =
    min != null && max != null
      ? `${min.toLocaleString("en-US")} - ${max.toLocaleString("en-US")}`
      : min != null
        ? `from ${min.toLocaleString("en-US")}`
        : `up to ${max!.toLocaleString("en-US")}`;
  return [range, currency ?? "", period ?? ""].filter(Boolean).join(" ");
}

function formatParsedProfile(profile: unknown): string | null {
  if (!profile || typeof profile !== "object") return null;
  // Only surface the fields a recruiter actually reads. Keeping the
  // raw jsonb out of the prompt would otherwise eat ~10k tokens of
  // structural noise per call.
  const p = profile as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof p.summary === "string" && p.summary.trim()) {
    lines.push("Summary:");
    lines.push(p.summary.trim());
    lines.push("");
  }
  if (Array.isArray(p.experience) && p.experience.length > 0) {
    lines.push("Experience:");
    for (const e of (p.experience as Record<string, unknown>[]).slice(0, 10)) {
      const company = typeof e.company === "string" ? e.company : "";
      const title = typeof e.title === "string" ? e.title : "";
      const from = typeof e.start_date === "string" ? e.start_date : "";
      const to = typeof e.end_date === "string" ? e.end_date : "Present";
      lines.push(`- ${title} at ${company} (${from} - ${to})`);
      if (typeof e.description === "string" && e.description.trim()) {
        lines.push(`  ${e.description.trim().slice(0, 400)}`);
      }
    }
    lines.push("");
  }
  if (Array.isArray(p.education) && p.education.length > 0) {
    lines.push("Education:");
    for (const ed of (p.education as Record<string, unknown>[]).slice(0, 5)) {
      const school = typeof ed.school === "string" ? ed.school : "";
      const degree = typeof ed.degree === "string" ? ed.degree : "";
      const field = typeof ed.field === "string" ? ed.field : "";
      lines.push(`- ${[degree, field].filter(Boolean).join(", ")} — ${school}`);
    }
    lines.push("");
  }
  if (Array.isArray(p.skills) && p.skills.length > 0) {
    lines.push(`Skills: ${(p.skills as unknown[]).slice(0, 30).join(", ")}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}
