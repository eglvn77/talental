"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/team";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Update a CUSTOM resource_value (any non-system definition the
 * workspace added in /settings/resources). System resources keep
 * routing through updateJobAction so the legacy mirror keeps firing
 * — this action is just the path for kinds 'markdown' and 'list'
 * that don't map to a column.
 *
 * Server validates the value shape against the definition's kind:
 *   - markdown: jsonb STRING (the raw markdown text)
 *   - list:     jsonb array of strings (trimmed, empties dropped)
 *   - structured/sequence/checklist: not supported here yet —
 *     structured needs an Ajv runtime, sequence is system-only,
 *     checklist (SOP) has its own workspace-level editor.
 *
 * Resolves workspace from the definition row + checks the job is
 * in the same workspace (RLS would catch a cross-workspace write
 * anyway; this is the friendlier error).
 */
export async function updateCustomResourceValueAction(input: {
  jobId: string;
  definitionId: string;
  value: unknown;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  const { data: defRow, error: defErr } = await db
    .from("resource_definitions")
    .select("id, key, kind, is_system, workspace_id, is_enabled")
    .eq("id", input.definitionId)
    .maybeSingle();
  if (defErr) return { ok: false, error: defErr.message.slice(0, 300) };
  if (!defRow) return { ok: false, error: "Definition not found" };
  const def = defRow as {
    id: string;
    key: string;
    kind: string;
    is_system: boolean;
    workspace_id: string;
    is_enabled: boolean;
  };
  if (def.workspace_id !== workspaceId) {
    return { ok: false, error: "Cross-workspace definition" };
  }
  if (def.is_system) {
    return {
      ok: false,
      error: "Use updateJobAction for system resources",
    };
  }
  if (!def.is_enabled) {
    return { ok: false, error: "Definition is disabled" };
  }

  let cleaned: unknown;
  if (def.kind === "markdown") {
    cleaned = typeof input.value === "string" ? input.value : "";
  } else if (def.kind === "list") {
    if (!Array.isArray(input.value)) {
      return { ok: false, error: "Expected an array of strings" };
    }
    cleaned = (input.value as unknown[])
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } else {
    return {
      ok: false,
      error: `Editor for kind="${def.kind}" not implemented yet`,
    };
  }

  // Inline upsert — we already have the definition_id, so the
  // shared helper's key lookup would be redundant.
  const { error: upErr } = await db.from("resource_values").upsert(
    {
      workspace_id: workspaceId,
      job_id: input.jobId,
      definition_id: def.id,
      value: cleaned as never,
      generated_by: "manual",
      generated_at: new Date().toISOString(),
    },
    { onConflict: "job_id,definition_id" },
  );
  if (upErr) return { ok: false, error: upErr.message.slice(0, 300) };
  revalidatePath(`/jobs/${input.jobId}/resources`);
  return { ok: true };
}
