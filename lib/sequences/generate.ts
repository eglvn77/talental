/**
 * "Generate with AI" — drafts a full outreach sequence from the
 * recruiter's brief (goal, tone, channels, free-form context) using
 * the same tool-forced pattern as lib/kickoff/claude.ts so the output
 * is structured JSON, never prose.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

export interface GenerateSequenceInput {
  name: string;
  goal: string; // recruiting | sales | partnership | customer_success | other
  followUps: number;
  tone: string; // direct | warm | expert | short | premium
  language: string; // "es" | "en"
  channels: string[]; // subset of step kinds
  context: string;
}

export interface GeneratedStep {
  kind: string;
  delay_value: number;
  delay_unit: "hours" | "days";
  subject: string | null;
  body: string;
}

const GENERATE_TOOL: Anthropic.Tool = {
  name: "emit_sequence",
  description: "Emit the generated outreach sequence as structured steps.",
  input_schema: {
    type: "object" as const,
    properties: {
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "email",
                "linkedin_invitation",
                "linkedin_message",
                "linkedin_inmail",
                "manual_task",
                "whatsapp",
              ],
            },
            delay_value: { type: "number" },
            delay_unit: { type: "string", enum: ["hours", "days"] },
            subject: { type: ["string", "null"] },
            body: { type: "string" },
          },
          required: ["kind", "delay_value", "delay_unit", "body"],
        },
      },
    },
    required: ["steps"],
  },
};

const SYSTEM = `You are an expert recruiting/sales outreach copywriter. You design multi-channel outreach sequences (email + LinkedIn) that get replies.

Rules:
- Write in the requested language and tone. Mexican Spanish when language is "es" (use "tú", warm-professional).
- Personalization variables available (use them naturally): {{firstName}}, {{fullName}}, {{title}}, {{companyName}}, {{jobPostingTitle}}, {{senderFirstName}}, {{senderFullName}}.
- First touch introduces the opportunity briefly; follow-ups add ONE new angle each (social proof, comp range hint, easy CTA), never "just bumping this".
- LinkedIn invitation notes ≤ 280 chars. LinkedIn messages 1-4 lines, no subject. Emails ≤ 120 words with a subject.
- delay for the FIRST step is 0 hours. Follow-ups: 2-4 days apart.
- Only use the channels the user selected.
- NO em dashes. NO invented facts, salaries, or links.`;

export async function generateSequenceSteps(
  input: GenerateSequenceInput,
): Promise<GeneratedStep[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const user = [
    `Sequence name: ${input.name}`,
    `Goal: ${input.goal}`,
    `Desired follow-ups after the first touch: ${input.followUps}`,
    `Tone: ${input.tone}`,
    `Language: ${input.language}`,
    `Allowed channels (step kinds): ${input.channels.join(", ")}`,
    "",
    "Context (job description / ICP / pains):",
    input.context || "(none provided)",
    "",
    `Produce ${input.followUps + 1} steps total via the emit_sequence tool.`,
  ].join("\n");

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [GENERATE_TOOL],
    tool_choice: { type: "tool", name: "emit_sequence" },
    messages: [{ role: "user", content: user }],
  });

  const toolUse = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) throw new Error("Model returned no structured sequence");
  const steps = (toolUse.input as { steps?: GeneratedStep[] }).steps ?? [];
  if (steps.length === 0) throw new Error("Model returned an empty sequence");
  return steps;
}

export function delayToMinutes(value: number, unit: "hours" | "days"): number {
  return unit === "hours" ? value * 60 : value * 24 * 60;
}
