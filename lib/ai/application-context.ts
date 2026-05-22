import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { hiring } from "@/lib/hiring";

/**
 * Per-application AI context.
 *
 * One Claude call generates BOTH the 1-sentence status line and 1-3
 * next-step suggestions. Shared context (recent events, stage,
 * notes, role) feeds both — splitting them into two calls would
 * double the cost without changing the answer.
 *
 * Triggered manually from the candidate slideover ("Actualizar") and
 * automatically when the application changes stage. A daily cron
 * can be added later to refresh stale rows.
 */

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1024;

export const NextStepSchema = z
  .object({
    label: z.string().min(1).max(140),
    urgency: z.enum(["low", "normal", "high"]),
    hint: z.string().max(280).optional(),
  })
  .strict();

export const AiContextSchema = z
  .object({
    status_line: z.string().min(1).max(200),
    next_steps: z.array(NextStepSchema).min(1).max(3),
  })
  .strict();

export type AiContext = z.infer<typeof AiContextSchema>;
export type NextStep = z.infer<typeof NextStepSchema>;

const TOOL = {
  name: "set_application_context",
  description:
    "Set the human-readable status line and 1-3 next-step suggestions for this application. Status line is one sentence; next steps are concrete recruiter actions.",
  input_schema: {
    type: "object",
    properties: {
      status_line: {
        type: "string",
        description:
          "One sentence (max ~120 chars) describing where this candidate is RIGHT NOW from a recruiter's perspective. In Spanish (Mexico). Examples: 'Esperando feedback del cliente sobre paquete (5 días)', 'No contestó el último InMail (hace 4 días)', 'En entrevista técnica el martes 10am'.",
      },
      next_steps: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                "Imperative action phrase in Spanish. Max ~80 chars. Example: 'Mandar referencia laboral', 'Recordar al cliente que de feedback', 'Agendar entrevista técnica'.",
            },
            urgency: {
              type: "string",
              enum: ["low", "normal", "high"],
              description:
                "High = client/candidate is waiting > 3 days, or SLA-breaking. Normal = standard pipeline action. Low = nice-to-have or follow-up.",
            },
            hint: {
              type: "string",
              description:
                "Optional 1-line context for the recruiter explaining WHY this step matters now (e.g. 'Lleva 4 días en este stage sin movimiento').",
            },
          },
          required: ["label", "urgency"],
          additionalProperties: false,
        },
      },
    },
    required: ["status_line", "next_steps"],
    additionalProperties: false,
  },
} as const;

const SYSTEM_PROMPT = `You're a senior recruiting operations assistant for a Mexican headhunting agency (Talental). Given an application's stage history, recent events, and role context, you produce:

1. A 1-sentence STATUS LINE in Spanish (Mexico) describing where the candidate is RIGHT NOW from the recruiter's perspective. Mention timing if relevant ("hace 4 días", "el martes 10am"). Don't restate the obvious stage name — say what's happening within it.

2. 1-3 NEXT STEPS — concrete recruiter actions, imperative phrasing, ordered by urgency. Only include steps that are actually next given the stage and elapsed time. Don't pad to 3 if 1 is enough.

Tone: terse, practical, in the recruiter's voice. No emoji. No "podrías considerar" filler. Direct verbs.

Always call the set_application_context tool exactly once.`;

/**
 * Gather the context payload from the DB and call Claude. Writes
 * the result back to the application row.
 */
export async function regenerateApplicationContext(applicationId: string): Promise<{
  ok: true;
  context: AiContext;
} | { ok: false; error: string }> {
  const db = await hiring();

  // Pull the application + its job + the most recent 20 events.
  // All in a single query; RLS scopes to workspace.
  const { data: appRow, error: appErr } = await db
    .from("applications")
    .select(
      `
      id, candidate_id, job_id, applied_at, status_changed_at, category,
      stage:pipeline_stages(name, category),
      candidate:candidates(full_name),
      job:jobs(title, role_type, status),
      events:application_events(event_type, payload, created_at)
    `,
    )
    .eq("id", applicationId)
    .order("created_at", { foreignTable: "events", ascending: false })
    .limit(20, { foreignTable: "events" })
    .maybeSingle();

  if (appErr || !appRow) {
    return { ok: false, error: appErr?.message || "Application not found" };
  }

  // Recent notes attached to this application (or its candidate).
  const candidateId = appRow.candidate_id as string;
  const { data: notes } = await db
    .from("notes")
    .select("body, created_at, entity_type")
    .or(
      `entity_type.eq.application,entity_type.eq.candidate`,
    )
    .or(`entity_id.eq.${applicationId},entity_id.eq.${candidateId}`)
    .order("created_at", { ascending: false })
    .limit(5);

  // Format the context payload as a structured message.
  const userMessage = buildUserMessage({ appRow, notes: notes ?? [] });

  // Call Claude.
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let toolInput: unknown;
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [TOOL as any],
      tool_choice: { type: "tool", name: TOOL.name },
    });
    const block = resp.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!block) {
      return { ok: false, error: "Model did not return a tool_use block" };
    }
    toolInput = block.input;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Validate the payload.
  const parsed = AiContextSchema.safeParse(toolInput);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `Validation failed at ${first?.path.join(".")}: ${first?.message}`,
    };
  }

  // Persist.
  const { error: updateErr } = await db
    .from("applications")
    .update({
      ai_status_line: parsed.data.status_line,
      ai_next_steps: parsed.data.next_steps,
      ai_context_updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  return { ok: true, context: parsed.data };
}

// ----- Helpers -------------------------------------------------------

type AppRow = {
  id: string;
  candidate_id: string;
  job_id: string;
  applied_at: string;
  status_changed_at: string;
  category: string | null;
  stage: { name: string; category: string } | null;
  candidate: { full_name: string } | null;
  job: { title: string; role_type: string | null; status: string } | null;
  events: Array<{
    event_type: string;
    payload: unknown;
    created_at: string;
  }> | null;
};

type NoteRow = {
  body: string;
  created_at: string;
  entity_type: string;
};

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function buildUserMessage({
  appRow,
  notes,
}: {
  appRow: unknown;
  notes: NoteRow[];
}): string {
  const a = appRow as AppRow;
  const lines: string[] = [];

  lines.push("# Application");
  lines.push(`Candidate: ${a.candidate?.full_name ?? "(unknown)"}`);
  lines.push(`Role: ${a.job?.title ?? "(unknown)"} (${a.job?.role_type ?? "unknown_role_type"})`);
  lines.push(`Role status: ${a.job?.status ?? "(unknown)"}`);
  lines.push(`Stage: ${a.stage?.name ?? "(no stage)"} (category: ${a.stage?.category ?? a.category ?? "—"})`);
  lines.push(`Applied: ${daysAgo(a.applied_at)} days ago`);
  lines.push(`Last stage change: ${daysAgo(a.status_changed_at)} days ago`);

  lines.push("");
  lines.push("# Recent events (newest first)");
  const events = a.events ?? [];
  if (events.length === 0) {
    lines.push("(none)");
  } else {
    for (const e of events) {
      const d = daysAgo(e.created_at);
      const payloadStr =
        e.payload && typeof e.payload === "object"
          ? JSON.stringify(e.payload).slice(0, 200)
          : "";
      lines.push(`- [${d}d ago] ${e.event_type} ${payloadStr}`);
    }
  }

  lines.push("");
  lines.push("# Recent notes (newest first)");
  if (notes.length === 0) {
    lines.push("(none)");
  } else {
    for (const n of notes) {
      const d = daysAgo(n.created_at);
      lines.push(`- [${d}d ago, ${n.entity_type}] ${n.body.slice(0, 300)}`);
    }
  }

  lines.push("");
  lines.push(
    "Generate the status line and 1-3 next steps via the set_application_context tool.",
  );

  return lines.join("\n");
}
