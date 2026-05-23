import "server-only";

import { getCvParserModel, CV_PARSER_MODEL } from "./gemini-client";
import { CV_PARSER_SYSTEM, CV_PARSER_RETRY_NOTE } from "./prompt";
import { ParsedCvSchema, type ParsedCv } from "./types";

/**
 * Run a CV through Gemini and return a validated ParsedCv.
 *
 * Two input modes:
 *   - { kind: "pdf", bytes }   → PDF passed as inlineData (base64).
 *     Multimodal layout-aware parsing.
 *   - { kind: "text", text }   → Already-extracted text (DOCX via
 *     mammoth, or anything else). Sent as a plain text part — no
 *     layout signals but more than enough for normal CV structure.
 *
 * Retries: if the response isn't valid JSON OR doesn't match the
 * zod schema, we retry up to MAX_ATTEMPTS - 1 times with a stricter
 * prompt appended. Per spec: max 2 retries (3 total attempts) then
 * bubble the error.
 *
 * Cost: approximated from response.usageMetadata. Gemini 2.5 Flash
 * pricing (as of writing): $0.075/M input, $0.30/M output. Reflected
 * in INPUT_USD_PER_M / OUTPUT_USD_PER_M; update when Google publishes
 * different rates.
 */

const MAX_ATTEMPTS = 3;

// TODO(pricing): verify against Google AI Studio billing page.
const INPUT_USD_PER_M = 0.075;
const OUTPUT_USD_PER_M = 0.3;

export type GeminiParseUsage = {
  input_tokens: number;
  output_tokens: number;
  cost_usd_estimated: number;
  attempts: number;
  model: typeof CV_PARSER_MODEL;
};

export type CvParseInput =
  | { kind: "pdf"; bytes: Buffer }
  | { kind: "text"; text: string };

export async function parseCvWithGemini(
  input: CvParseInput,
): Promise<{ parsed: ParsedCv; usage: GeminiParseUsage }> {
  const model = getCvParserModel();

  // Build the static "content part" for the CV — either an inlineData
  // PDF or a plain text block. The system prompt itself is rebuilt per
  // attempt because the retry-note is appended conditionally.
  const contentPart =
    input.kind === "pdf"
      ? {
          inlineData: {
            mimeType: "application/pdf",
            data: input.bytes.toString("base64"),
          },
        }
      : {
          text:
            "Texto del CV extraído del archivo Word:\n\n---\n" +
            input.text +
            "\n---",
        };

  let lastError: string = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const systemPrompt =
      attempt === 1
        ? CV_PARSER_SYSTEM
        : `${CV_PARSER_SYSTEM}\n\n${CV_PARSER_RETRY_NOTE}`;

    let response;
    try {
      response = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: systemPrompt }, contentPart],
          },
        ],
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }

    const usage = response.response.usageMetadata;
    totalInputTokens += usage?.promptTokenCount ?? 0;
    totalOutputTokens += usage?.candidatesTokenCount ?? 0;

    const raw = response.response.text();
    let json: unknown;
    try {
      json = JSON.parse(stripCodeFences(raw));
    } catch (e) {
      lastError = `Invalid JSON: ${e instanceof Error ? e.message : String(e)}. First 200 chars: ${raw.slice(0, 200)}`;
      continue;
    }

    const validation = ParsedCvSchema.safeParse(json);
    if (!validation.success) {
      const first = validation.error.issues[0];
      lastError = `Schema validation failed at ${first?.path.join(".") || "(root)"}: ${first?.message ?? "unknown"}`;
      continue;
    }

    return {
      parsed: validation.data,
      usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd_estimated:
          (totalInputTokens / 1_000_000) * INPUT_USD_PER_M +
          (totalOutputTokens / 1_000_000) * OUTPUT_USD_PER_M,
        attempts: attempt,
        model: CV_PARSER_MODEL,
      },
    };
  }

  throw new Error(
    `Gemini CV parse failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastError}`,
  );
}

/** Strip ```json fences and trim, in case the model ignores the no-markdown rule. */
function stripCodeFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    // Remove opening fence (with optional language tag).
    t = t.replace(/^```[a-zA-Z]*\n?/, "");
    // Remove trailing fence.
    if (t.endsWith("```")) t = t.slice(0, -3);
  }
  return t.trim();
}
