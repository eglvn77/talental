"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring/clients";
import { isAuthenticated } from "@/lib/auth/session";
import type {
  InitiativePriority,
  InitiativeStatus,
  InitiativeType,
} from "@/lib/hiring/enums";

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
 * Create one initiative. Defaults: status=idea, type=feature,
 * priority=P2, source='manual'. Position lands at the END of its
 * status column (highest position + 1) so it doesn't collide with
 * existing rows during kanban drag-reorder.
 */
export async function createInitiativeAction(input: {
  title: string;
  type?: InitiativeType;
  priority?: InitiativePriority | null;
  status?: InitiativeStatus;
  area_id?: string | null;
  agent_id?: string | null;
  notes?: string | null;
  source?: string;
}): Promise<ActionResult<{ id: string }>> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title required" };

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const status = input.status ?? "idea";

  const { data: tail } = await db
    .from("initiatives")
    .select("position")
    .eq("workspace_id", workspaceId)
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (tail?.position ?? -1) + 1;

  const { data, error } = await db
    .from("initiatives")
    .insert({
      workspace_id: workspaceId,
      title,
      type: input.type ?? "feature",
      priority: input.priority ?? "P2",
      status,
      area_id: input.area_id ?? null,
      agent_id: input.agent_id ?? null,
      notes: input.notes ?? null,
      source: input.source ?? "manual",
      position: nextPos,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) ?? "Failed to create",
    };
  }
  revalidatePath("/agents");
  return { ok: true, data: { id: data.id as string } };
}

/**
 * Partial update for one initiative — same pattern as
 * updateAgentAction. Position changes via reorderInitiativesAction
 * separately (no need to send the whole positions map here).
 */
export async function updateInitiativeAction(
  id: string,
  patch: {
    title?: string;
    type?: InitiativeType;
    priority?: InitiativePriority | null;
    status?: InitiativeStatus;
    area_id?: string | null;
    agent_id?: string | null;
    notes?: string | null;
  },
): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  if (Object.keys(patch).length === 0) return { ok: true };

  const db = await hiring();
  const { error } = await db.from("initiatives").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/agents");
  return { ok: true };
}

export async function deleteInitiativeAction(
  id: string,
): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { error } = await db.from("initiatives").delete().eq("id", id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/agents");
  return { ok: true };
}

/**
 * Drop-target action for kanban: assigns the new status AND rewrites
 * positions for the destination column so the dragged card sits at
 * the right slot. Pass the FULL ordered id array of the column the
 * card landed in (after the drop) so the server doesn't have to
 * guess. Source-column positions don't need a rewrite — they remain
 * sequential by removal.
 */
export async function moveInitiativeAction(input: {
  id: string;
  toStatus: InitiativeStatus;
  /** Ordered ids of every row in the destination column AFTER the
   *  drop, including the moved id. Positions are re-stamped 0..N-1. */
  destOrderedIds: string[];
}): Promise<ActionResult> {
  const g = await ensureAdmin();
  if (!g.ok) return g;
  const db = await hiring();

  // 1. Apply status change for the moved id.
  const { error: statusErr } = await db
    .from("initiatives")
    .update({ status: input.toStatus })
    .eq("id", input.id);
  if (statusErr) return { ok: false, error: statusErr.message.slice(0, 300) };

  // 2. Re-stamp positions in destination column. Each row gets its
  //    index. Done in a loop because Supabase has no native
  //    "update with index" — N rows ⇒ N round trips, but the kanban
  //    columns are short (10–30) so it's fine.
  for (let i = 0; i < input.destOrderedIds.length; i++) {
    const { error } = await db
      .from("initiatives")
      .update({ position: i })
      .eq("id", input.destOrderedIds[i]);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  }

  revalidatePath("/agents");
  return { ok: true };
}
