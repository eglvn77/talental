import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Single source of truth for the CV parser model. Swap this constant
 * to upgrade (gemini-2.5-pro for higher quality, or a future model)
 * — every other file in the pipeline reads from getCvParserModel().
 */
export const CV_PARSER_MODEL = "gemini-2.5-flash" as const;

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export function getCvParserModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return client.getGenerativeModel({
    model: CV_PARSER_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      // Keep deterministic-ish so retries don't drift in unhelpful
      // directions. Output cap is the schema, not a token budget,
      // so we don't set maxOutputTokens here.
      temperature: 0.1,
    },
  });
}
