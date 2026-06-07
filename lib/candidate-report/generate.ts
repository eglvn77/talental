import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { POPULATE_CANDIDATE_REPORT_TOOL } from "./tool-schema";
import type { CandidateReportStruct } from "./types";

/**
 * Pure generator — assembles the user message from the inputs, calls
 * Claude with the populate_candidate_report tool, returns the
 * validated struct. No DB access; the caller handles persistence.
 *
 * The system prompt comes from the workspace's default candidate_
 * report prompt (seeded in 20260607120000). Caller passes it in
 * verbatim so the per-prompt cache works.
 *
 * Token budget: transcripts can be long (30k+ chars each); the
 * 1M-context Sonnet 4.x handles plenty, but we cap at MAX_INPUT_CHARS
 * total as defense against runaway prompts. Recruiters with very
 * long calls will lose tail content — refine if it bites in practice.
 */

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8192;
const MAX_INPUT_CHARS = 600_000; // ~150k tokens, well under 1M context

export type ReportInputTranscript = {
  id: string;
  title: string | null;
  recorded_at: string | null;
  text: string;
};

export type ReportInput = {
  /** Workspace-resolved system prompt (the seeded master template). */
  systemPrompt: string;
  /** Model override; defaults to Sonnet 4.x. */
  model?: string;
  job: {
    title: string;
    requirements_text: string | null;
    work_modality: string | null;
    salary_summary: string | null;
  };
  candidate: {
    name: string;
    current_title: string | null;
    current_company: string | null;
    location: string | null;
    email: string | null;
    linkedin_url: string | null;
  };
  transcripts: ReportInputTranscript[];
  cv_text: string | null;
  parsed_profile_summary: string | null;
};

export type GenerateResult =
  | { ok: true; struct: CandidateReportStruct; model: string }
  | { ok: false; error: string };

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Build the user-message text Claude receives. Order matches the
 * priority rule in the master prompt: transcripts first (the primary
 * signal), then CV, then enrichment.
 */
function buildUserMessage(input: ReportInput): string {
  const parts: string[] = [];

  parts.push("# Job");
  parts.push(`Title: ${input.job.title}`);
  if (input.job.work_modality) {
    parts.push(`Work modality: ${input.job.work_modality}`);
  }
  if (input.job.salary_summary) {
    parts.push(`Salary: ${input.job.salary_summary}`);
  }
  if (input.job.requirements_text) {
    parts.push("");
    parts.push("Requirements:");
    parts.push(input.job.requirements_text);
  }

  parts.push("");
  parts.push("# Candidate");
  parts.push(`Name: ${input.candidate.name}`);
  if (input.candidate.current_title || input.candidate.current_company) {
    parts.push(
      `Currently: ${[input.candidate.current_title, input.candidate.current_company]
        .filter(Boolean)
        .join(" at ")}`,
    );
  }
  if (input.candidate.location) parts.push(`Location: ${input.candidate.location}`);
  if (input.candidate.email) parts.push(`Email: ${input.candidate.email}`);
  if (input.candidate.linkedin_url) {
    parts.push(`LinkedIn: ${input.candidate.linkedin_url}`);
  }

  if (input.transcripts.length > 0) {
    parts.push("");
    parts.push(`# Interview transcripts (${input.transcripts.length})`);
    input.transcripts.forEach((t, idx) => {
      parts.push("");
      parts.push(
        `## Transcript ${idx + 1} of ${input.transcripts.length} — id: ${t.id}`,
      );
      parts.push(`Title: ${t.title ?? "(untitled)"}`);
      if (t.recorded_at) parts.push(`Recorded: ${t.recorded_at}`);
      parts.push("");
      parts.push(t.text);
    });
  } else {
    parts.push("");
    parts.push("# Interview transcripts");
    parts.push("(none — generate based on CV + LinkedIn only)");
  }

  if (input.cv_text) {
    parts.push("");
    parts.push("# CV text");
    parts.push(input.cv_text);
  }

  if (input.parsed_profile_summary) {
    parts.push("");
    parts.push("# LinkedIn / enriched profile");
    parts.push(input.parsed_profile_summary);
  }

  parts.push("");
  parts.push(
    "Call populate_candidate_report exactly once with the full structured report. Follow every rule from the system prompt.",
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
 * Generate. Throws are converted into `{ok:false, error}` so the
 * caller can map directly to an ActionResult.
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [POPULATE_CANDIDATE_REPORT_TOOL as any],
      tool_choice: {
        type: "tool",
        name: POPULATE_CANDIDATE_REPORT_TOOL.name,
      },
    });
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      return {
        ok: false,
        error: `Model did not return a tool_use block. Stop reason: ${response.stop_reason}`,
      };
    }
    if (toolUse.name !== POPULATE_CANDIDATE_REPORT_TOOL.name) {
      return { ok: false, error: `Unexpected tool: ${toolUse.name}` };
    }
    return {
      ok: true,
      struct: toolUse.input as CandidateReportStruct,
      model,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
