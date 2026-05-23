import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  ParsedCvSchema,
  PARSE_CV_TOOL,
  type ParsedCv,
} from "./types";

/**
 * Send the extracted CV text to Claude with a strict tool-use call.
 * Returns the parsed shape + token usage so the caller can log cost.
 *
 * Model: claude-opus-4-7. CV parsing benefits from the bigger model
 * because real CVs are messy — implicit dates, mixed languages,
 * inconsistent formatting. The 200k context is overkill but the
 * fidelity matters.
 */

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 4096;

// Best-public-estimate pricing per million tokens. Update when Anthropic
// publishes official rates for claude-opus-4-7. The api_usage_log row
// stores cost_usd_estimated computed from these constants; downstream
// dashboards can re-derive if rates change.
const INPUT_USD_PER_M = 15;
const OUTPUT_USD_PER_M = 75;

const SYSTEM_PROMPT = `You are a precise CV/resume parser. The user will paste the full extracted text of a candidate's resume. Your job is to call the save_parsed_cv tool exactly once with the structured data.

Rules:
- Output language: keep field VALUES in the language they appear in the CV (mostly Spanish or English, sometimes mixed).
- Dates: prefer "YYYY-MM" when month is present, fallback to "YYYY". Leave end_date unset for currently-held roles (also set is_current=true).
- Experience ordering: most recent first.
- summary: 2-4 sentences. If the CV has a Profile/About/Summary section, use it verbatim. Otherwise synthesize from the most recent role.
- headline: short one-liner (e.g. "Senior Product Designer at Stripe"). Empty if you can't infer it confidently.
- skills: hard skills + software + frameworks only. No soft skills, no buzzwords.
- languages: include proficiency in parens when stated (e.g. "Inglés (C1)", "English (Native)").
- Do NOT hallucinate fields. If something isn't in the CV, leave it unset rather than guess.
- Always call save_parsed_cv. Never reply in text.`;

export type CvParseUsage = {
  input_tokens: number;
  output_tokens: number;
  cost_usd_estimated: number;
};

export async function parseCvWithClaude(
  cvText: string,
): Promise<{ parsed: ParsedCv; usage: CvParseUsage }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Here is the extracted CV text. Parse it via save_parsed_cv.\n\n---\n${cvText}\n---`,
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [PARSE_CV_TOOL as any],
    tool_choice: { type: "tool", name: PARSE_CV_TOOL.name },
  });

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!block) {
    throw new Error(
      "Claude did not return a tool_use block. Stop reason: " +
        response.stop_reason,
    );
  }

  // Validate with zod for runtime safety. Throws clean error with path
  // on shape drift.
  const validation = ParsedCvSchema.safeParse(block.input);
  if (!validation.success) {
    const first = validation.error.issues[0];
    throw new Error(
      `Parse validation failed at ${first?.path.join(".") || "(root)"}: ${first?.message ?? "unknown"}`,
    );
  }

  const input_tokens = response.usage.input_tokens ?? 0;
  const output_tokens = response.usage.output_tokens ?? 0;
  const cost_usd_estimated =
    (input_tokens / 1_000_000) * INPUT_USD_PER_M +
    (output_tokens / 1_000_000) * OUTPUT_USD_PER_M;

  return {
    parsed: validation.data,
    usage: { input_tokens, output_tokens, cost_usd_estimated },
  };
}
