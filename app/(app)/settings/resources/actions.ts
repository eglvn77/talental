"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/team";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Phase 3a manager actions for hiring.resource_definitions.
 *
 * Scope is intentionally minimal for the read-only-ish first cut:
 *   - rename a definition (label only)
 *   - toggle is_enabled
 *   - reorder
 *
 * System rows enforce their own invariants via DB triggers
 * (`tg_resource_definitions_protect_system`): we cannot change key,
 * is_system, or kind; we cannot delete; but label/position/is_enabled
 * are all editable. Create + delete + custom defs land in a later
 * commit.
 */

export async function renameResourceDefinitionAction(input: {
  id: string;
  label: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const trimmed = input.label.trim();
  if (!trimmed) return { ok: false, error: "Label cannot be empty" };
  if (trimmed.length > 80) {
    return { ok: false, error: "Label too long (max 80 chars)" };
  }
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();
  const { error } = await db
    .from("resource_definitions")
    .update({ label: trimmed })
    .eq("id", input.id)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/resources");
  return { ok: true };
}

export async function toggleResourceDefinitionEnabledAction(input: {
  id: string;
  isEnabled: boolean;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();
  const { error } = await db
    .from("resource_definitions")
    .update({ is_enabled: input.isEnabled })
    .eq("id", input.id)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/resources");
  return { ok: true };
}

export async function reorderResourceDefinitionsAction(input: {
  orderedIds: string[];
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();
  // Bulk reposition. Each row's `position` becomes its index in the
  // submitted array. We do it as N individual updates rather than one
  // upsert because the workspace_id+id pair already exists — we're
  // only changing position. Same pattern the closure-reasons reorder
  // uses.
  for (let i = 0; i < input.orderedIds.length; i++) {
    const id = input.orderedIds[i]!;
    const { error } = await db
      .from("resource_definitions")
      .update({ position: i })
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  }
  revalidatePath("/settings/resources");
  return { ok: true };
}
