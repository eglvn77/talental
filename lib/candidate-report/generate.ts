import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Pure generator — assembles the user message in the EXACT format
 * the workspace's candidate_report prompt expects (ROLE CONTEXT,
 * MY NOTES, INTERVIEW TRANSCRIPT, INTERVIEW SUMMARY, CANDIDATE DATA,
 * REPORT LANGUAGE), calls Claude, returns the raw markdown the
 * model produced.
 *
 * No tool_use, no schema enforcement: Talental's existing prompt is
 * a polished markdown generator with star ratings, conditional
 * sections, and strict voice rules. Forcing it through a structured
 * tool schema would discard half of those constraints. Markdown
 * direct preserves the prompt as the source of truth.
 *
 * The caller (server action) extracts the rating via regex for the
 * UI badge and persists the markdown straight to
 * applications.candidate_report.
 */

const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_TOKENS = 4096;
const MAX_INPUT_CHARS = 600_000; // ~150k tokens, well under 1M context

export type ReportInputTranscript = {
  id: string;
  title: string | null;
  recorded_at: string | null;
  text: string;
  /** Granola provides summary_markdown via the metadata field. When
   *  present, it's surfaced under INTERVIEW SUMMARY so the prompt's
   *  "use it alongside the transcript, not as a replacement" rule
   *  fires. */
  summary_markdown?: string | null;
};

export type ReportInput = {
  /** Workspace-resolved system prompt (the seeded master template
   *  from hiring.prompts WHERE category='candidate_report' AND
   *  is_default=true). */
  systemPrompt: string;
  /** Model override; falls back to claude-opus-4-8 (Talental's
   *  default for high-stakes reports). */
  model?: string;
  /** "Spanish" or "English" — passed verbatim under REPORT LANGUAGE
   *  so the prompt's exact language rule fires. */
  reportLanguage: "Spanish" | "English";
  job: {
    title: string;
    requirements_text: string | null;
    work_modality: string | null;
    salary_summary: string | null;
    location: string | null;
  };
  candidate: {
    name: string;
    current_title: string | null;
    current_company: string | null;
    location: string | null;
    email: string | null;
    linkedin_url: string | null;
  };
  /** Recruiter's free-text notes from applications.recruiter_notes.
   *  Highest-priority signal per the prompt's INPUT PRIORITY rule. */
  recruiter_notes: string | null;
  transcripts: ReportInputTranscript[];
  cv_text: string | null;
  /** Pre-formatted summary of parsed_profile (summary/experience/
   *  education/skills). Goes under CANDIDATE DATA. */
  parsed_profile_summary: string | null;
};

export type GenerateResult =
  | { ok: true; markdown: string; model: string }
  | { ok: false; error: string };

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Build the user message in the format the workspace's prompt
 * expects. Sections appear in the same order as the prompt's INPUTS
 * spec; absent inputs are simply omitted (the prompt explicitly
 * handles missing inputs with "If MY NOTES is empty… proceed
 * normally").
 */
function buildUserMessage(input: ReportInput): string {
  const parts: string[] = [];

  // REPORT LANGUAGE — first, explicit, single line. The prompt rule
  // says "Do not infer the language from any other signal", so we
  // make it impossible to miss.
  parts.push(`REPORT LANGUAGE: ${input.reportLanguage}`);
  parts.push("");

  // ROLE CONTEXT — JD + requirements + comp range + location.
  parts.push("--- ROLE CONTEXT ---");
  parts.push(`Role: ${input.job.title}`);
  if (input.job.work_modality) {
    parts.push(`Modality: ${input.job.work_modality}`);
  }
  if (input.job.location) {
    parts.push(`Job location: ${input.job.location}`);
  }
  if (input.job.salary_summary) {
    parts.push(`Compensation range: ${input.job.salary_summary}`);
  }
  if (input.job.requirements_text) {
    parts.push("");
    parts.push("Requirements (ranked, most important first):");
    parts.push(input.job.requirements_text);
  }
  parts.push("");

  // MY NOTES — highest priority. Only included when present; the
  // prompt's rule for absent notes says "proceed normally".
  if (input.recruiter_notes?.trim()) {
    parts.push("--- MY NOTES ---");
    parts.push(input.recruiter_notes.trim());
    parts.push("");
  }

  // INTERVIEW TRANSCRIPT — multiple calls separated by the exact
  // header format the prompt's multi-call section references:
  // "--- CALL X: Title (Date) ---"
  if (input.transcripts.length > 0) {
    parts.push("--- INTERVIEW TRANSCRIPT ---");
    input.transcripts.forEach((t, idx) => {
      const dateStr = t.recorded_at
        ? new Date(t.recorded_at).toISOString().slice(0, 10)
        : "no date";
      const title = t.title?.trim() || "(untitled call)";
      parts.push("");
      parts.push(`--- CALL ${idx + 1}: ${title} (${dateStr}) ---`);
      parts.push(t.text);
    });
    parts.push("");
  }

  // INTERVIEW SUMMARY — Granola's pre-written summary, one per
  // transcript that has it. Concatenated under a single header so
  // the prompt sees "INTERVIEW SUMMARY" exactly once.
  const summaries = input.transcripts
    .map((t) => t.summary_markdown?.trim())
    .filter((s): s is string => Boolean(s));
  if (summaries.length > 0) {
    parts.push("--- INTERVIEW SUMMARY ---");
    summaries.forEach((s, idx) => {
      if (summaries.length > 1) parts.push(`(Call ${idx + 1})`);
      parts.push(s);
      parts.push("");
    });
  }

  // CANDIDATE DATA — CV first (preferred per prompt), then
  // LinkedIn/parsed_profile if available.
  const candidateDataChunks: string[] = [];
  candidateDataChunks.push(`Name: ${input.candidate.name}`);
  if (input.candidate.current_title || input.candidate.current_company) {
    candidateDataChunks.push(
      `Current role: ${[input.candidate.current_title, input.candidate.current_company]
        .filter(Boolean)
        .join(" at ")}`,
    );
  }
  if (input.candidate.location) {
    candidateDataChunks.push(`Candidate location: ${input.candidate.location}`);
  }
  if (input.candidate.email) {
    candidateDataChunks.push(`Email: ${input.candidate.email}`);
  }
  if (input.candidate.linkedin_url) {
    candidateDataChunks.push(`LinkedIn: ${input.candidate.linkedin_url}`);
  }
  if (input.cv_text?.trim()) {
    candidateDataChunks.push("");
    candidateDataChunks.push("CV / Resume:");
    candidateDataChunks.push(input.cv_text.trim());
  }
  if (input.parsed_profile_summary?.trim()) {
    candidateDataChunks.push("");
    candidateDataChunks.push("LinkedIn profile data:");
    candidateDataChunks.push(input.parsed_profile_summary.trim());
  }
  parts.push("--- CANDIDATE DATA ---");
  parts.push(candidateDataChunks.join("\n"));
  parts.push("");

  parts.push("");
  parts.push(
    "Produce the candidate report following every rule in the system prompt. Return only the markdown report, no preamble.",
  );

  return truncate(parts.join("\n"), MAX_INPUT_CHARS);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return (
    text.slice(0, max) +
    `\n\n[truncated to ${max} chars — original was ${text.length}]`
  );
}

/**
 * Call Claude with the workspace prompt + assembled inputs. Returns
 * the raw markdown body the model produced. No tool_use — Talental's
 * prompt already produces well-formatted markdown with star ratings,
 * conditional sections, and a strict 250-word cap; structuring on
 * top would discard half of those rules.
 */
export async function generateCandidateReport(
  input: ReportInput,
): Promise<GenerateResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY not configured" };
  }
  const model = input.model || DEFAULT_MODEL;
  const c = client();
  try {
    const response = await c.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: input.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildUserMessage(input) }],
    });

    // Concatenate every text block; usually there's one.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) {
      return {
        ok: false,
        error: `Empty response. Stop reason: ${response.stop_reason}`,
      };
    }
    return { ok: true, markdown: text, model };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Extract the rating (1-5) from the rendered report so the UI can
 * surface a quick badge / toast confirmation. Matches both English
 * "Rating: ⭐⭐⭐⭐ (4/5)" and Spanish "Calificación: ⭐⭐⭐⭐⭐ (5/5)".
 * Returns null if the rating line isn't found — the report is still
 * valid, just no badge to display.
 */
export function extractRatingFromMarkdown(markdown: string): {
  stars: number;
  label: string;
} | null {
  const m = /\b(?:Rating|Calificaci(?:ó|o)n)\b[^\n]*?\((\d)\/5\)/i.exec(
    markdown,
  );
  if (!m) return null;
  const stars = Number(m[1]);
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) return null;
  return { stars, label: `${stars}/5` };
}
