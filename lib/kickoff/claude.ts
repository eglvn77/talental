import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { POPULATE_KICKOFF_TOOL } from "./tool-schema";
import type {
  KickoffMaterials,
  KickoffOutput,
  KickoffSetupAnswers,
} from "./types";

/**
 * Wrapper over the Anthropic SDK for the kickoff generation. The system
 * prompt is large (~10k tokens) and identical across runs, so we mark it
 * for prompt caching. The first run within a 5-minute window pays full
 * input cost; subsequent runs read from cache at ~10% of the price.
 */

const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_TOKENS = 16384;

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function languageLabel(code: "es" | "en"): string {
  return code === "es" ? "Spanish" : "English";
}

/**
 * Format the recruiter's setup answers + materials into the user message
 * the master prompt expects to consume. Keeps everything explicit so the
 * model doesn't guess at the variables.
 */
export function buildUserMessage(input: {
  jobTitle: string;
  companyName: string | null;
  locationLabel: string | null;
  salarySummary: string | null;
  workModalityLabel: string | null;
  setupAnswers: KickoffSetupAnswers;
  materials: KickoffMaterials;
  runKind: "kickoff" | "calibration";
}): string {
  const lines: string[] = [];

  lines.push("# Setup answers");
  lines.push("");
  // role_type is intentionally NOT serialized: the role is decided by
  // the chosen kickoff prompt (its authoritative ROLE TYPE header), not
  // by a per-job enum. Sending both would let them disagree.
  lines.push(`- jd_language: ${languageLabel(input.setupAnswers.jd_language)}`);
  lines.push(
    `- outreach_language: ${languageLabel(input.setupAnswers.outreach_language)}`,
  );
  lines.push(
    `- role_snapshot_includes: { salary: ${input.setupAnswers.role_snapshot_includes.salary}, company_name: ${input.setupAnswers.role_snapshot_includes.company_name} }`,
  );
  lines.push(`- use_emojis: ${input.setupAnswers.use_emojis}`);
  lines.push(
    `- ai_process_language: ${input.setupAnswers.ai_process_language ? languageLabel(input.setupAnswers.ai_process_language) : "n/a (full headhunting)"}`,
  );
  lines.push(`- create_assessment: ${input.setupAnswers.create_assessment}`);

  lines.push("");
  lines.push("# Role facts (already known to the ATS — use as-is)");
  lines.push("");
  // Intake-first create: when the recruiter opened the vacante from just
  // the intake, the title is blank. Tell the model to infer it from the
  // materials and return it in `job_title` (the ATS backfills it).
  if (input.jobTitle.trim()) {
    lines.push(`- Role title: ${input.jobTitle}`);
  } else {
    lines.push(
      "- Role title: (not provided — INFER a concise, conventional job title from the intake/materials and return it in the `job_title` field)",
    );
  }
  if (input.companyName) lines.push(`- Company: ${input.companyName}`);
  if (input.locationLabel) {
    lines.push(`- Location: ${input.locationLabel}`);
  } else {
    lines.push(
      "- Location: (not provided — infer from the intake/materials if stated and put it in overview.office_location)",
    );
  }
  if (input.workModalityLabel)
    lines.push(`- Work modality: ${input.workModalityLabel}`);
  if (input.salarySummary) lines.push(`- Salary: ${input.salarySummary}`);

  lines.push("");
  lines.push("# Materials");
  lines.push("");
  lines.push("## Intake call transcript");
  lines.push("");
  lines.push(input.materials.intake_transcript || "(not provided)");

  if (input.materials.client_jd?.trim()) {
    lines.push("");
    lines.push("## Client's job description (secondary source)");
    lines.push("");
    lines.push(input.materials.client_jd);
  }

  if (input.materials.additional_context?.trim()) {
    lines.push("");
    lines.push("## Additional context");
    lines.push("");
    lines.push(input.materials.additional_context);
  }

  if (
    input.runKind === "calibration" &&
    input.materials.calibration_context?.trim()
  ) {
    lines.push("");
    lines.push(
      "## Calibration context (debrief transcripts, client feedback, etc.)",
    );
    lines.push("");
    lines.push(
      "This is a calibration run — the role already has generated content. Use the calibration context below to refine your output. Treat the original intake as the baseline truth and adjust where the calibration material says otherwise.",
    );
    lines.push("");
    lines.push(input.materials.calibration_context);
  }

  lines.push("");
  lines.push(
    "Generate the kickoff package by calling the populate_kickoff tool exactly once with all required fields filled per the rules in the system prompt.",
  );

  return lines.join("\n");
}

/**
 * Invoke Claude with the master prompt + materials. Returns the parsed
 * tool input or throws with a useful error.
 */
export async function generateKickoff(input: {
  systemPrompt: string;
  userMessage: string;
  model?: string;
}): Promise<KickoffOutput> {
  const c = client();
  const model = input.model || DEFAULT_MODEL;

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
    messages: [{ role: "user", content: input.userMessage }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [POPULATE_KICKOFF_TOOL as any],
    tool_choice: { type: "tool", name: POPULATE_KICKOFF_TOOL.name },
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error(
      "Model did not return a tool_use block. Stop reason: " +
        response.stop_reason,
    );
  }
  if (toolUse.name !== POPULATE_KICKOFF_TOOL.name) {
    throw new Error(`Unexpected tool: ${toolUse.name}`);
  }

  return toolUse.input as KickoffOutput;
}

/**
 * Streaming variant — same prompt + tool-use config, but yields a
 * `tokens` callback as Claude emits the populate_kickoff JSON. Lets
 * the UI show progress while the 15-30s generation happens.
 *
 * The final parsed output is returned at the end. `onTokens` receives
 * the cumulative character count of the JSON being assembled — we
 * don't surface partial JSON because tool-use input is built up as a
 * single stream of unparseable fragments until the block completes.
 */
export async function generateKickoffStreaming(
  input: { systemPrompt: string; userMessage: string; model?: string },
  onTokens: (cumulativeChars: number) => void,
): Promise<KickoffOutput> {
  const c = client();
  const model = input.model || DEFAULT_MODEL;

  let jsonChars = 0;

  const stream = c.messages.stream({
    model,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: input.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: input.userMessage }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [POPULATE_KICKOFF_TOOL as any],
    tool_choice: { type: "tool", name: POPULATE_KICKOFF_TOOL.name },
  });

  stream.on("inputJson", (delta) => {
    if (typeof delta === "string") {
      jsonChars += delta.length;
      onTokens(jsonChars);
    }
  });

  const final = await stream.finalMessage();
  const toolUse = final.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error(
      "Model did not return a tool_use block. Stop reason: " +
        final.stop_reason,
    );
  }
  if (toolUse.name !== POPULATE_KICKOFF_TOOL.name) {
    throw new Error(`Unexpected tool: ${toolUse.name}`);
  }
  return toolUse.input as KickoffOutput;
}
