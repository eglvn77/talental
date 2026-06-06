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

/**
 * Create a CUSTOM (non-system) resource definition.
 *
 * Constraints enforced here:
 *   - key must be a slug (lowercase, hyphens, no leading hyphen)
 *   - key must not collide with existing rows in the workspace
 *   - kind ∈ {markdown, list, structured, checklist}.
 *     'sequence' is reserved for is_system rows (DB CHECK enforces it
 *     too — we reject early to give a friendlier error).
 *
 * Position lands at the end. is_system=false always — system rows
 * are seeded by the workspace-creation trigger, not by this action.
 */
/**
 * Slug helper — turn a free-text label into a key. Strips diacritics,
 * lowercases, replaces non-alphanumerics with hyphens, trims edges.
 * Always returns a valid slug or empty (caller falls back to a
 * timestamp-derived id).
 */
function slugifyLabel(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createResourceDefinitionAction(input: {
  label: string;
  kind: "markdown" | "list" | "structured" | "checklist";
  /** Optional — what the AI should generate during kickoff/calibrate.
   *  Empty = manual-only section, no AI involvement. */
  generatorPrompt?: string;
}): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Label cannot be empty" };
  if (label.length > 80) {
    return { ok: false, error: "Label too long (max 80 chars)" };
  }
  const allowedKinds = ["markdown", "list", "structured", "checklist"] as const;
  if (!(allowedKinds as readonly string[]).includes(input.kind)) {
    return { ok: false, error: "Invalid kind" };
  }

  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  // Auto-slugify from label; collision-check + suffix on dupes.
  const base = slugifyLabel(label) || `resource-${Date.now().toString(36)}`;
  let key = base;
  let attempt = 2;
  // Cap the loop so a pathological workspace can't spin forever.
  while (attempt < 100) {
    const { data: existing } = await db
      .from("resource_definitions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("key", key)
      .maybeSingle();
    if (!existing) break;
    key = `${base}-${attempt}`;
    attempt += 1;
  }

  // Next position = (max position + 1) for the workspace.
  const { data: maxRow } = await db
    .from("resource_definitions")
    .select("position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition =
    typeof maxRow?.position === "number" ? maxRow.position + 1 : 0;

  const { data, error } = await db
    .from("resource_definitions")
    .insert({
      workspace_id: workspaceId,
      key,
      label,
      kind: input.kind,
      position: nextPosition,
      is_system: false,
      is_enabled: true,
      schema_json: {},
      generator_prompt: (input.generatorPrompt ?? "").trim(),
      template_json: {},
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/resources");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/**
 * Update the AI generation prompt on any resource_definition row,
 * including system ones. The protection trigger only blocks
 * key/is_system/kind changes; label and generator_prompt are
 * intentionally editable so workspaces can tweak what the AI
 * produces for the standard sections.
 */
export async function updateResourceDefinitionPromptAction(input: {
  id: string;
  generatorPrompt: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();
  const trimmed = input.generatorPrompt.trim();
  if (trimmed.length > 8000) {
    return { ok: false, error: "Prompt too long (max 8000 chars)" };
  }
  const { error } = await db
    .from("resource_definitions")
    .update({ generator_prompt: trimmed })
    .eq("id", input.id)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/resources");
  return { ok: true };
}

/**
 * Delete a CUSTOM definition + cascade its values. System rows are
 * blocked by the protection trigger; we still pre-check `is_system`
 * here for a friendlier error.
 *
 * ON DELETE CASCADE on resource_values handles the cleanup so we
 * don't orphan per-job content. Editor reads will then default the
 * value to empty / absent on every job — equivalent to "section
 * doesn't exist anymore".
 */
export async function deleteResourceDefinitionAction(input: {
  id: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();
  const { data: row, error: loadErr } = await db
    .from("resource_definitions")
    .select("is_system")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message.slice(0, 300) };
  if (!row) return { ok: false, error: "Not found" };
  if ((row as { is_system: boolean }).is_system) {
    return {
      ok: false,
      error: "Cannot delete a system definition",
    };
  }
  const { error } = await db
    .from("resource_definitions")
    .delete()
    .eq("id", input.id)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/resources");
  return { ok: true };
}

