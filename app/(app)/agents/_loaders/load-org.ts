import "server-only";

import { hiring, getRequestWorkspaceId } from "@/lib/hiring/clients";
import type { AgentAreaRow, AgentRow, PromptRow } from "@/lib/hiring";

/**
 * Everything the Organization tab needs in one server-side read:
 *   - areas in display order (position asc, name asc tie-break)
 *   - agents in display order within each area (position asc)
 *   - the prompts table joined just enough to surface each agent's
 *     prompt label without a separate fetch
 *
 * Scoped by current workspace via getRequestWorkspaceId(); service-
 * role bypasses RLS the same way every other lib/hiring loader does.
 */
export type AgentWithPrompt = AgentRow & {
  prompt: Pick<PromptRow, "id" | "key" | "label"> | null;
};

export type OrgBundle = {
  areas: AgentAreaRow[];
  agents: AgentWithPrompt[];
};

export async function loadOrg(): Promise<OrgBundle> {
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();
  const [{ data: areaRows }, { data: agentRows }] = await Promise.all([
    db
      .from("agent_areas")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
    db
      .from("agents")
      .select(
        `
        *,
        prompt:prompts!agents_prompt_id_fkey(id, key, label)
        `,
      )
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  type AgentRaw = AgentRow & {
    prompt:
      | Pick<PromptRow, "id" | "key" | "label">
      | Array<Pick<PromptRow, "id" | "key" | "label">>
      | null;
  };
  const agents: AgentWithPrompt[] = ((agentRows ?? []) as AgentRaw[]).map(
    (a) => ({
      ...a,
      prompt: Array.isArray(a.prompt) ? (a.prompt[0] ?? null) : a.prompt,
    }),
  );

  return {
    areas: (areaRows ?? []) as AgentAreaRow[],
    agents,
  };
}
