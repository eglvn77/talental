import "server-only";

import { hiring, getRequestWorkspaceId } from "@/lib/hiring/clients";
import type { InitiativeRow } from "@/lib/hiring";

/**
 * Initiatives for the Backlog tab. Ordered by status column (loose
 * priority order — P0 first), then `position` for kanban drag-order
 * within each column.
 */
export async function loadBacklog(): Promise<InitiativeRow[]> {
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();
  const { data } = await db
    .from("initiatives")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []) as InitiativeRow[];
}
