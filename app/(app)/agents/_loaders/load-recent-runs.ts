import "server-only";

import { hiring, getRequestWorkspaceId } from "@/lib/hiring/clients";
import type { AgentRunRow } from "@/lib/hiring";

/**
 * Last N agent_runs for the dashboard activity feed. Joined to the
 * agent's name so each row renders without a secondary lookup.
 */
export type RecentRun = AgentRunRow & {
  agent: { id: string; name: string } | null;
};

export async function loadRecentRuns(limit = 20): Promise<RecentRun[]> {
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();
  const { data } = await db
    .from("agent_runs")
    .select(
      `
      *,
      agent:agents!agent_runs_agent_id_fkey(id, name)
      `,
    )
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false })
    .limit(limit);
  type Raw = AgentRunRow & {
    agent:
      | { id: string; name: string }
      | Array<{ id: string; name: string }>
      | null;
  };
  return ((data ?? []) as Raw[]).map((r) => ({
    ...r,
    agent: Array.isArray(r.agent) ? (r.agent[0] ?? null) : r.agent,
  }));
}
