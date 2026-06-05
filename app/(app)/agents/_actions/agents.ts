"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring/clients";
import { isAuthenticated } from "@/lib/auth/session";
import type {
  AgentKind,
  AgentRuntime,
  AgentStatus,
} from "@/lib/hiring/enums";

/**
 * Server actions for the Talental OS agent registry. Mirror the
 * shape of app/(app)/actions.ts — `ensureAdmin` guard, narrow
 * `ActionResult<T>` discriminated union, `revalidatePath` on the
 * cockpit so subsequent renders see the change.
 */

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function ensureAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!(await isAuthenticated())) return { ok: false, error: "Unauthorized" };
  return { ok: true };
}

/**
 * Partial update for one agent. Every field is optional — only the
 * keys present in `patch` get written. The slideover sends the
 * whole edited form but undefined-skipped values stay untouched.
 * Caller-side enum types catch invalid values at compile time;
 * server adds nothing extra because RLS is service-role bypassed.
 */
export async function updateAgentAction(
  id: string,
  patch: {
    name?: string;
    role_title?: string | null;
    description?: string | null;
    status?: AgentStatus;
    kind?: AgentKind;
    runtime?: AgentRuntime;
    area_id?: string | null;
    model?: string | null;
    schedule_cron?: string | null;
    slack_channel_id?: string | null;
    prompt_id?: string | null;
  },
): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  if (Object.keys(patch).length === 0) return { ok: true };

  const db = await hiring();
  const { error } = await db.from("agents").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath("/agents");
  return { ok: true };
}

/**
 * Create a new agent. Defaults: kind=executor, status=planned (so
 * a freshly-created agent doesn't start running immediately),
 * runtime=claude_code, position=end-of-area.
 */
export async function createAgentAction(input: {
  name: string;
  area_id?: string | null;
  kind?: AgentKind;
  status?: AgentStatus;
  runtime?: AgentRuntime;
  role_title?: string | null;
  description?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required" };

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Insert at the end of the area (or end-of-workspace if no area).
  const { data: tail } = await db
    .from("agents")
    .select("position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (tail?.position ?? -1) + 1;

  const { data, error } = await db
    .from("agents")
    .insert({
      workspace_id: workspaceId,
      name,
      kind: input.kind ?? "executor",
      status: input.status ?? "planned",
      runtime: input.runtime ?? "claude_code",
      role_title: input.role_title ?? null,
      description: input.description ?? null,
      area_id: input.area_id ?? null,
      position: nextPos,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) ?? "Failed to create agent",
    };
  }

  revalidatePath("/agents");
  return { ok: true, data: { id: data.id as string } };
}

/**
 * Hard-delete an agent. Past `agent_runs` rows reference this id
 * via ON DELETE SET NULL so their history survives without the
 * agent. Use sparingly — usually `status=paused` is the right
 * answer for "stop this agent" rather than removing it.
 */
export async function deleteAgentAction(
  id: string,
): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { error } = await db.from("agents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/agents");
  return { ok: true };
}
