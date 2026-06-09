"use server";

import { revalidatePath } from "next/cache";
import { hiring } from "@/lib/hiring";
import { requireCurrentTeamMember } from "@/lib/auth/team";
import {
  extractRatingFromMarkdown,
  generateCandidateReport,
  type ReportInput,
  type ReportInputTranscript,
} from "@/lib/candidate-report/generate";
import { markdownToHtml } from "@/lib/candidate-report/markdown-to-html";
import { type ActionResult } from "./_shared";

/**
 * Generate (or re-generate) the AI candidate report for one
 * application. Loads inputs, formats them under the section labels
 * the workspace prompt expects (ROLE CONTEXT / MY NOTES / INTERVIEW
 * TRANSCRIPT / INTERVIEW SUMMARY / CANDIDATE DATA / REPORT LANGUAGE),
 * calls Claude, persists the returned markdown directly.
 *
 * Refuses to run when there's nothing to base the report on (no
 * transcript, no CV, no parsed_profile, no recruiter_notes).
 */

type GenerateOk = {
  rating: string | null;
  inserted_at: string;
  inputs_summary: {
    transcripts: number;
    has_notes: boolean;
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

  // 1. Load app + nested candidate + job.
  const { data: appRow, error: appErr } = await db
    .from("applications")
    .select(
      `
      id, candidate_id, job_id, workspace_id, recruiter_notes,
      candidate:candidates(
        id, full_name, email, linkedin_url, location,
        current_position, current_company_name,
        resume_text, parsed_profile
      ),
      job:jobs(
        id, title, location, work_modality, requirements,
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
    recruiter_notes: string | null;
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
      location: string | null;
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

  // 2. Transcripts (with the Granola summary_markdown extracted from
  // metadata so the INTERVIEW SUMMARY section can be populated).
  //
  // Match both:
  //   - Transcripts explicitly linked to this application_id, AND
  //   - Transcripts linked to this candidate at the candidate level
  //     (application_id IS NULL) — these are Granola calls that
  //     came in via the email auto-link OR were claimed by name
  //     match from the candidate header's Sync button.
  // Without this broader query, just-arrived transcripts that
  // haven't been claimed yet won't feed the report.
  const { data: transcriptRows } = await db
    .from("interview_transcripts")
    .select("id, title, recorded_at, transcript, metadata")
    .or(
      `application_id.eq.${input.applicationId},and(candidate_id.eq.${app.candidate_id},application_id.is.null)`,
    )
    .order("recorded_at", { ascending: true });
  const transcripts: ReportInputTranscript[] = (transcriptRows ?? []).map(
    (r) => {
      const row = r as {
        id: string;
        title: string | null;
        recorded_at: string | null;
        transcript: string;
        metadata: unknown;
      };
      const md = row.metadata as { summary_markdown?: string | null } | null;
      return {
        id: row.id,
        title: row.title,
        recorded_at: row.recorded_at,
        text: row.transcript,
        summary_markdown: md?.summary_markdown ?? null,
      };
    },
  );

  // 3. Validate we have enough inputs.
  const cvText = app.candidate.resume_text?.trim() || null;
  const parsedProfile = app.candidate.parsed_profile;
  const hasEnrichment = Boolean(
    parsedProfile && typeof parsedProfile === "object",
  );
  const hasNotes = Boolean(app.recruiter_notes?.trim());
  if (
    transcripts.length === 0 &&
    !cvText &&
    !hasEnrichment &&
    !hasNotes
  ) {
    return {
      ok: false,
      error:
        "Sin info para generar reporte. Necesitas al menos un transcript, notas del recruiter, CV, o perfil enriquecido (Coresignal).",
    };
  }

  // 4. Resolve the workspace's default candidate_report prompt.
  const { data: promptRow, error: promptErr } = await db
    .from("prompts")
    .select("key, body, model")
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
  const prompt = promptRow as { key: string; body: string; model: string | null };

  // 5. Compose inputs.
  const requirementsText = formatRequirements(app.job.requirements);
  const salarySummary = formatSalary(
    app.job.salary_min,
    app.job.salary_max,
    app.job.salary_currency,
    app.job.salary_frequency,
  );
  const profileSummary = formatParsedProfile(parsedProfile);

  // Report language comes from the job's "Client Language" custom
  // field (kind=select with options ["English","Spanish"]). The
  // recruiter sets it per-vacante in /jobs/[id] custom fields. Falls
  // back to Spanish for unset values — Talental is Spanish-first.
  const reportLanguage = await resolveClientLanguage(
    db,
    app.workspace_id,
    app.job_id,
  );

  const generateInput: ReportInput = {
    systemPrompt: prompt.body,
    model: prompt.model ?? undefined,
    reportLanguage,
    job: {
      title: app.job.title,
      requirements_text: requirementsText,
      work_modality: app.job.work_modality,
      salary_summary: salarySummary,
      location: app.job.location,
    },
    candidate: {
      name: app.candidate.full_name,
      current_title: app.candidate.current_position,
      current_company: app.candidate.current_company_name,
      location: app.candidate.location,
      email: app.candidate.email,
      linkedin_url: app.candidate.linkedin_url,
    },
    recruiter_notes: app.recruiter_notes,
    transcripts,
    cv_text: cvText,
    parsed_profile_summary: profileSummary,
  };

  // 6. Call Claude.
  const genRes = await generateCandidateReport(generateInput);
  if (!genRes.ok) {
    return { ok: false, error: genRes.error };
  }

  // 7. Extract rating for the toast/badge BEFORE converting to HTML
  // (regex is simpler against markdown). Then convert markdown→HTML
  // so the editor (Tiptap) can render it as rich text.
  const rating = extractRatingFromMarkdown(genRes.markdown);
  const html = markdownToHtml(genRes.markdown);
  const inputProvenance = {
    transcripts_used: transcripts.map((t) => ({
      id: t.id,
      title: t.title ?? "",
    })),
    cv_used: Boolean(cvText),
    enrichment_used: hasEnrichment,
    notes_used: hasNotes,
    prompt_key: prompt.key,
    report_language: reportLanguage,
    rating_extracted: rating,
  };
  const now = new Date().toISOString();
  const { error: updateErr } = await db
    .from("applications")
    .update({
      candidate_report: html,
      report_generated_at: now,
      report_model: genRes.model,
      report_inputs: inputProvenance as never,
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
      rating: rating?.label ?? null,
      inserted_at: now,
      inputs_summary: {
        transcripts: transcripts.length,
        has_notes: hasNotes,
        cv: Boolean(cvText),
        enrichment: hasEnrichment,
      },
    },
  };
}

/** Save manual edits + stamp report_edited_at. */
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
  revalidatePath(`/candidates`);
  return { ok: true, data: { edited_at: now } };
}

/**
 * Wipe the candidate report for one application. Sets every
 * report_* column back to null so the UI shows the "Generate"
 * empty state and any provenance from the previous run is gone.
 * Transcripts on the application are untouched — only the
 * generated/edited markdown is cleared.
 */
export async function deleteCandidateReportAction(input: {
  applicationId: string;
}): Promise<ActionResult> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const db = await hiring();
  const { error } = await db
    .from("applications")
    .update({
      candidate_report: null,
      report_generated_at: null,
      report_model: null,
      report_inputs: null,
      report_edited_at: null,
    })
    .eq("id", input.applicationId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath(`/candidates`);
  return { ok: true };
}

// ── helpers ─────────────────────────────────────────────────

/**
 * Read the job's "Client Language" custom field (kind=select with
 * options ["English","Spanish"]) and map to the workspace prompt's
 * expected REPORT LANGUAGE input. Resolves the definition by `key`
 * so renames of the label don't break this.
 */
async function resolveClientLanguage(
  db: Awaited<ReturnType<typeof hiring>>,
  workspaceId: string,
  jobId: string,
): Promise<"Spanish" | "English"> {
  const { data: def } = await db
    .from("custom_field_definitions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "job")
    .eq("key", "client_language")
    .maybeSingle();
  const definitionId = (def as { id?: string } | null)?.id;
  if (!definitionId) return "Spanish";
  const { data: val } = await db
    .from("custom_field_values")
    .select("value")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .eq("definition_id", definitionId)
    .maybeSingle();
  const raw = (val as { value?: unknown } | null)?.value;
  if (typeof raw === "string" && raw.toLowerCase() === "english") {
    return "English";
  }
  return "Spanish";
}

function formatRequirements(req: unknown): string | null {
  if (!req || typeof req !== "object") return null;
  if (Array.isArray(req)) {
    const items = (req as unknown[])
      .map((r, idx) => {
        if (typeof r === "string") return `${idx + 1}. ${r}`;
        if (r && typeof r === "object") {
          const obj = r as Record<string, unknown>;
          const label = typeof obj.label === "string" ? obj.label : null;
          const must = obj.must_have === true ? " (must-have)" : "";
          return label ? `${idx + 1}. ${label}${must}` : null;
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
  frequency: string | null,
): string | null {
  if (min == null && max == null) return null;
  const range =
    min != null && max != null
      ? `${min.toLocaleString("en-US")} - ${max.toLocaleString("en-US")}`
      : min != null
        ? `from ${min.toLocaleString("en-US")}`
        : `up to ${max!.toLocaleString("en-US")}`;
  return [range, currency ?? "", frequency ?? ""].filter(Boolean).join(" ");
}

function formatParsedProfile(profile: unknown): string | null {
  if (!profile || typeof profile !== "object") return null;
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
