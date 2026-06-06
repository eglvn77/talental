import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring/clients";
import { anthropicClient } from "@/lib/ai/anthropic-client";

/**
 * Per-section AI calibration. The full /calibrate dialog re-runs the
 * whole kickoff against tweaked materials; this is the lighter
 * companion — give the recruiter a textbox above each Paquete tab
 * that mutates ONLY that section with a focused prompt.
 *
 * Flow per call:
 *   1. Load the job's overview + the current value of the section.
 *   2. Build a tiny Claude tool with a schema for just that section.
 *   3. Ask Claude to return the new value given the user's prompt.
 *   4. Persist back to the right column / child tables.
 *
 * Sections live either on the jobs row (jsonb columns) or in the
 * sequences + sequence_steps child tables (outreach_sequence). The
 * `applyResult` callback abstracts the write so the action body is
 * uniform.
 */

export type SectionKey =
  | "requirements"
  | "sourcing"
  | "hiring_process"
  | "application_questions"
  | "ai_interview_questions"
  | "talental_interview_script"
  | "outreach_sequence";

export type CalibrateSectionResult =
  | { ok: true }
  | { ok: false; error: string };

// ── Per-section config ──────────────────────────────────────────────

type SectionCfg = {
  /** JSON-schema property accepted by the calibration tool. */
  schema: Record<string, unknown>;
  /** Read the current value from a `jobs` row + sequences (when needed). */
  readCurrent: (job: JobShape) => unknown;
  /** Persist the new value. Writes to jobs / sequences as appropriate. */
  apply: (args: {
    db: Awaited<ReturnType<typeof hiring>>;
    workspaceId: string;
    jobId: string;
    job: JobShape;
    value: unknown;
  }) => Promise<void>;
  /** Short label embedded into the prompt to anchor the model. */
  promptLabel: string;
};

type JobShape = {
  id: string;
  title: string | null;
  workspace_id: string;
  overview: unknown;
  requirements: unknown;
  sourcing: unknown;
  hiring_process: unknown;
  screening_questions: unknown;
  interview_questions: unknown;
  interview_script: unknown;
};

const SECTIONS: Record<SectionKey, SectionCfg> = {
  requirements: {
    promptLabel: "REQUIREMENTS",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["must", "nice"],
      properties: {
        must: { type: "array", items: { type: "string" } },
        nice: { type: "array", items: { type: "string" } },
      },
    },
    readCurrent: (job) => job.requirements ?? { must: [], nice: [] },
    async apply({ db, jobId, value }) {
      const { error } = await db
        .from("jobs")
        .update({ requirements: value as never })
        .eq("id", jobId);
      if (error) throw new Error(error.message);
    },
  },

  sourcing: {
    promptLabel: "SOURCING GUIDELINES",
    schema: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        criteria: { type: "array", items: { type: "string" } },
        questions: { type: "array", items: { type: "string" } },
        target_companies: { type: "array", items: { type: "string" } },
      },
      required: ["criteria", "questions", "target_companies"],
    },
    readCurrent: (job) => job.sourcing,
    async apply({ db, jobId, value }) {
      const { error } = await db
        .from("jobs")
        .update({ sourcing: value as never })
        .eq("id", jobId);
      if (error) throw new Error(error.message);
    },
  },

  hiring_process: {
    promptLabel: "HIRING PROCESS",
    schema: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "who", "focus"],
        properties: {
          order: { type: "integer" },
          who: { type: "string" },
          focus: { type: "string" },
          format: { type: ["string", "null"] },
        },
      },
    },
    readCurrent: (job) => job.hiring_process ?? [],
    async apply({ db, jobId, value }) {
      const { error } = await db
        .from("jobs")
        .update({ hiring_process: value as never })
        .eq("id", jobId);
      if (error) throw new Error(error.message);
    },
  },

  application_questions: {
    promptLabel: "APPLICATION QUESTIONS (Tally form)",
    schema: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "requirement", "type"],
        properties: {
          question: { type: "string" },
          requirement: { type: "string" },
          type: { type: "string", enum: ["eliminatory", "preferential"] },
          auto_reject_rule: { type: ["string", "null"] },
        },
      },
    },
    readCurrent: (job) => job.screening_questions ?? [],
    async apply({ db, jobId, value }) {
      const { error } = await db
        .from("jobs")
        .update({ screening_questions: value as never })
        .eq("id", jobId);
      if (error) throw new Error(error.message);
    },
  },

  ai_interview_questions: {
    promptLabel: "AI INTERVIEW QUESTIONS",
    schema: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "criteria"],
        properties: {
          category: { type: "string" },
          description: { type: "string" },
          criteria: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "question", "strong", "weak"],
              properties: {
                name: { type: "string" },
                question: { type: "string" },
                strong: { type: "string" },
                weak: { type: "string" },
                rationale: { type: "string" },
                strong_example_answer: { type: "string" },
                weak_example_answer: { type: "string" },
                probing_questions: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    readCurrent: (job) => job.interview_questions ?? [],
    async apply({ db, jobId, value }) {
      const { error } = await db
        .from("jobs")
        .update({ interview_questions: value as never })
        .eq("id", jobId);
      if (error) throw new Error(error.message);
    },
  },

  talental_interview_script: {
    promptLabel: "TALENTAL INTERVIEW SCRIPT (markdown)",
    schema: { type: "string" },
    readCurrent: (job) =>
      (job.interview_script as { markdown?: string } | null)?.markdown ?? "",
    async apply({ db, jobId, value }) {
      const { error } = await db
        .from("jobs")
        .update({ interview_script: { markdown: value as string } as never })
        .eq("id", jobId);
      if (error) throw new Error(error.message);
    },
  },

  outreach_sequence: {
    promptLabel: "OUTREACH SEQUENCE (5 steps, multi-channel)",
    schema: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["step", "channel", "delay_hours", "body"],
        properties: {
          step: { type: "integer" },
          channel: {
            type: "string",
            enum: [
              "email",
              "linkedin_invitation",
              "linkedin_inmail",
              "linkedin_message",
            ],
          },
          delay_hours: { type: "integer" },
          subject: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    async readCurrent(_job) {
      void _job;
      return [];
    },
    async apply({ db, workspaceId, jobId, job, value }) {
      // Replace the steps of the vacante's default sequence. Create a
      // new sequence (draft) if none exists yet — mirrors the kickoff
      // persist path. Column names here match hiring.sequence_steps:
      //   position / kind / delay_minutes / subject_template /
      //   body_template / task_title / task_body / config.
      const steps = Array.isArray(value)
        ? (value as Array<{
            step: number;
            channel: string;
            delay_hours: number;
            subject?: string;
            body: string;
          }>)
        : [];

      const { data: existing } = await db
        .from("sequences")
        .select("id")
        .eq("default_job_id", jobId)
        .limit(1);
      let sequenceId = existing?.[0]?.id as string | undefined;
      if (!sequenceId) {
        const { data: created, error: e1 } = await db
          .from("sequences")
          .insert({
            workspace_id: workspaceId,
            name: `${(job.title ?? "Outreach").trim()} — Outreach`,
            description: "Generated by Calibrate. Review before activating.",
            status: "draft",
            target_entity_type: "candidate",
            default_job_id: jobId,
          })
          .select("id")
          .single();
        if (e1) throw new Error(`Create sequence: ${e1.message}`);
        sequenceId = (created as { id: string }).id;
      }

      const { error: e2 } = await db
        .from("sequence_steps")
        .delete()
        .eq("sequence_id", sequenceId);
      if (e2) throw new Error(`Reset steps: ${e2.message}`);

      if (steps.length > 0) {
        const payload = steps.map((s) => {
          const mapped = mapChannelToKind(s.channel);
          return {
            workspace_id: workspaceId,
            sequence_id: sequenceId,
            position: s.step,
            kind: mapped.kind,
            delay_minutes: s.delay_hours * 60,
            subject_template: s.subject ?? null,
            body_template: s.body ?? null,
            task_title: mapped.task_title ?? null,
            task_body: mapped.task_title && s.body ? s.body : null,
            config: { channel: s.channel },
          };
        });
        const { error: e3 } = await db.from("sequence_steps").insert(payload);
        if (e3) throw new Error(`Insert steps: ${e3.message}`);
      }
    },
  },
};

export function isSectionKey(value: string): value is SectionKey {
  return value in SECTIONS;
}

// ── Main entry ───────────────────────────────────────────────────────

export async function calibrateSection(args: {
  jobId: string;
  section: SectionKey;
  userPrompt: string;
  model?: string;
}): Promise<CalibrateSectionResult> {
  const userPrompt = args.userPrompt.trim();
  if (!userPrompt) {
    return { ok: false, error: "Empty prompt" };
  }
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const { data: jobRow, error: loadErr } = await db
    .from("jobs")
    .select(
      "id, title, workspace_id, overview, requirements, sourcing, hiring_process, screening_questions, interview_questions, interview_script",
    )
    .eq("id", args.jobId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!jobRow) return { ok: false, error: "Job not found" };
  const job = jobRow as JobShape;
  if (job.workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace job" };
  }

  const cfg = SECTIONS[args.section];
  const current = await Promise.resolve(cfg.readCurrent(job));

  const toolName = `update_${args.section}`;
  const tool: Anthropic.Tool = {
    name: toolName,
    description: `Replace the role's ${cfg.promptLabel} with the new value. Call exactly once.`,
    input_schema: {
      type: "object" as const,
      additionalProperties: false,
      required: ["value"],
      properties: { value: cfg.schema },
    } as unknown as Anthropic.Tool["input_schema"],
  };

  const system = `You are an expert recruiter editing ONE section of a vacante's package.

THE GOLDEN RULE: change ONLY what the recruiter asked you to change. Everything else must stay byte-for-byte identical to the CURRENT value.

In particular:
- PRESERVE THE ORDER OF ITEMS. If the current value is an array, the output array MUST have the same items in the same positions unless the recruiter explicitly asked to reorder.
- PRESERVE THE COUNT OF ITEMS. Do not add or remove items unless explicitly asked.
- PRESERVE EVERY FIELD on every item. If the recruiter asks to change one field (e.g. translate the body), keep step/channel/delay_hours/subject/etc. EXACTLY as-is.
- If asked to change language, translate the text fields in place — never reshuffle, renumber, or change channels.
- If a request is ambiguous, lean toward the smallest change that satisfies it.

Return ONLY the updated section via the tool call.`;

  const userMessage = [
    `ROLE OVERVIEW (context — do not modify, just for reference):`,
    `${safeJson(job.overview)}`,
    ``,
    `CURRENT ${cfg.promptLabel}:`,
    `${safeJson(current)}`,
    ``,
    `RECRUITER REQUEST:`,
    userPrompt,
    ``,
    `Return the NEW ${cfg.promptLabel} via the ${toolName} tool.`,
  ].join("\n");

  const client = anthropicClient();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: args.model ?? "claude-sonnet-4-5",
      max_tokens: 8192,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `AI call failed: ${msg.slice(0, 300)}` };
  }

  const toolUse = response.content.find((c) => c.type === "tool_use") as
    | Anthropic.ToolUseBlock
    | undefined;
  if (!toolUse) {
    return { ok: false, error: "Model did not return a tool call" };
  }
  const newValue = (toolUse.input as { value: unknown }).value;

  try {
    await cfg.apply({ db, workspaceId, jobId: args.jobId, job, value: newValue });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Persist failed: ${msg.slice(0, 300)}` };
  }

  return { ok: true };
}

/**
 * Map the model's channel enum to the sequence_steps.kind enum +
 * an optional task_title for the "manual reminder" variants. Mirror
 * of the helper in lib/kickoff/persist.ts so the two writers stay
 * in lockstep.
 */
function mapChannelToKind(channel: string): {
  kind: "email" | "linkedin_message" | "manual_task";
  task_title?: string;
} {
  switch (channel) {
    case "email":
      return { kind: "email" };
    case "linkedin_message":
      return { kind: "linkedin_message" };
    case "linkedin_invitation":
      return {
        kind: "manual_task",
        task_title: "Send LinkedIn connection request",
      };
    case "linkedin_inmail":
      return { kind: "manual_task", task_title: "Send LinkedIn InMail" };
    default:
      return { kind: "manual_task", task_title: `Step (${channel})` };
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v);
  }
}
