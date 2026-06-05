import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { hiring } from "@/lib/hiring/clients";
import type { AgentRow, PromptRow } from "@/lib/hiring";
import { anthropicClient } from "@/lib/ai/anthropic-client";

/**
 * Core execution engine for in-app agents. One function — pure
 * server, no UI — that takes an agent and (optionally) an inbound
 * message, runs the model, and persists the result in
 * `hiring.agent_runs`.
 *
 * Lifecycle:
 *   1. INSERT agent_runs (status='running', started_at=now)
 *   2. Resolve the agent's linked prompt (agents.prompt_id → prompts).
 *      No prompt → bail with status='error', summary='no_prompt'.
 *   3. Call Anthropic (via lib/ai/anthropic-client which routes
 *      through Vercel AI Gateway when configured).
 *   4. UPDATE agent_runs (status='ok'|'error', finished_at, summary,
 *      output, tokens).
 *
 * Single-shot text response only — no tools. Fase 3 will extend this
 * with per-agent toolsets.
 *
 * Returns the agent_run id so callers (API route, cron, Slack
 * webhook) can read the row back for the UI / response.
 */

const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 4096;

export type RunInput = {
  /** Optional inbound message — e.g. the body of a Slack mention.
   *  When absent, the agent gets a synthetic "scheduled run" prompt. */
  message?: string;
  /** Optional source label written to `agent_runs.output.source` so
   *  the dashboard can split manual vs cron vs slack runs. */
  source?: "manual" | "cron" | "slack" | "api";
  /** Optional Slack context to round-trip back into the output for
   *  the response webhook. */
  slack?: {
    channelId: string;
    threadTs?: string | null;
    userId?: string | null;
  };
};

export type RunResult = {
  runId: string;
  status: "ok" | "error";
  summary: string | null;
  text: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  error: string | null;
};

export async function runAgent(
  agentId: string,
  input: RunInput = {},
): Promise<RunResult> {
  const db = await hiring();

  // 1. Load the agent + linked prompt in one round-trip.
  const { data: agentRaw, error: agentErr } = await db
    .from("agents")
    .select(
      `
      *,
      prompt:prompts!agents_prompt_id_fkey(*)
      `,
    )
    .eq("id", agentId)
    .maybeSingle();
  if (agentErr || !agentRaw) {
    throw new Error(agentErr?.message ?? "Agent not found");
  }
  type AgentWithPromptRaw = AgentRow & {
    prompt: PromptRow | PromptRow[] | null;
  };
  const a = agentRaw as AgentWithPromptRaw;
  const prompt = Array.isArray(a.prompt) ? (a.prompt[0] ?? null) : a.prompt;

  // 2. Insert the agent_run row in 'running' state. We need the id
  //    immediately so cron / API callers can return it for polling.
  const startedAt = new Date().toISOString();
  const { data: runRow, error: runErr } = await db
    .from("agent_runs")
    .insert({
      workspace_id: a.workspace_id,
      agent_id: a.id,
      started_at: startedAt,
      status: "running",
      output: {
        source: input.source ?? "manual",
        message: input.message ?? null,
        ...(input.slack ? { slack: input.slack } : {}),
      } as never,
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    throw new Error(runErr?.message ?? "Failed to insert agent_runs");
  }
  const runId = runRow.id as string;

  // 3. Run the model — guarded so a failure still closes out the row.
  try {
    if (!prompt) {
      throw new Error("Agent has no linked prompt (agents.prompt_id is null)");
    }
    if (a.status !== "active") {
      throw new Error(`Agent is ${a.status}, not active`);
    }
    if (a.runtime !== "in_app") {
      // Surface the mismatch — Fase 1 agents are marked claude_code
      // because they live as external routines. The in-app runner
      // should only handle the in_app row.
      throw new Error(
        `Agent runtime is ${a.runtime}; in-app runner only handles 'in_app'`,
      );
    }

    const userText =
      input.message?.trim() ||
      "Scheduled execution. Produce your standard output for this slot.";

    const client = anthropicClient();
    const response = await client.messages.create({
      model: a.model ?? DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: prompt.body ?? "",
          // Prompt-cache the system block. Same prompt across many
          // runs ⇒ subsequent calls within 5min read at ~10% cost.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userText }],
    });

    const text = extractText(response);
    const summary = text ? firstLine(text, 240) : null;
    const tokensIn = response.usage?.input_tokens ?? null;
    const tokensOut = response.usage?.output_tokens ?? null;
    const tokensTotal =
      (tokensIn ?? 0) + (tokensOut ?? 0) || null;

    await db
      .from("agent_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        summary,
        tokens: tokensTotal,
        output: {
          source: input.source ?? "manual",
          message: input.message ?? null,
          ...(input.slack ? { slack: input.slack } : {}),
          text,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          model: a.model ?? DEFAULT_MODEL,
          prompt_key: prompt.key,
          stop_reason: response.stop_reason,
        } as never,
      })
      .eq("id", runId);

    return {
      runId,
      status: "ok",
      summary,
      text,
      tokensIn,
      tokensOut,
      error: null,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message.slice(0, 1000) : String(err);
    await db
      .from("agent_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: msg,
        summary: `Error: ${msg.slice(0, 200)}`,
      })
      .eq("id", runId);
    return {
      runId,
      status: "error",
      summary: `Error: ${msg.slice(0, 200)}`,
      text: null,
      tokensIn: null,
      tokensOut: null,
      error: msg,
    };
  }
}

function extractText(
  response: Anthropic.Message,
): string | null {
  const parts: string[] = [];
  for (const block of response.content) {
    if (block.type === "text") parts.push(block.text);
  }
  const joined = parts.join("\n").trim();
  return joined || null;
}

function firstLine(s: string, max: number): string {
  const line = s.split("\n").find((l) => l.trim().length > 0) ?? s;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
