"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { requireAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function revalidate() {
  revalidatePath("/settings/closure-reasons");
  // Job header reads the joined closure_reason; pipeline + jobs list
  // display closed status.
  revalidatePath("/jobs");
}

export async function createClosureReasonAction(input: {
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const t = await getT();
  const name = input.name.trim();
  if (!name) return { ok: false, error: t("errors.nameRequired") };
  if (name.length > 80) return { ok: false, error: t("errors.max80Chars") };
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: maxRow } = await db
    .from("job_closure_reasons")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | undefined) ?? 0) + 10;

  const { data, error } = await db
    .from("job_closure_reasons")
    .insert({
      workspace_id: workspaceId,
      name,
      position: nextPosition,
      is_active: true,
      is_system: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || t("errors.createFailed"),
    };
  }
  revalidate();
  return { ok: true, data: { id: data.id as string } };
}

export async function updateClosureReasonAction(input: {
  id: string;
  name?: string;
  is_active?: boolean;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const patch: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const t = await getT();
    const trimmed = input.name.trim();
    if (!trimmed) return { ok: false, error: t("errors.nameRequired") };
    if (trimmed.length > 80) return { ok: false, error: t("errors.max80Chars") };
    patch.name = trimmed;
  }
  if (typeof input.is_active === "boolean") patch.is_active = input.is_active;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await db
    .from("job_closure_reasons")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidate();
  return { ok: true };
}

/** Delete a closure reason. FK on jobs.closure_reason_id is
 *  ON DELETE SET NULL — historical closed jobs keep `closure_notes`
 *  text but their structured pointer clears. */
export async function deleteClosureReasonAction(input: {
  id: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { error } = await db
    .from("job_closure_reasons")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidate();
  return { ok: true };
}

export async function reorderClosureReasonsAction(input: {
  orderedIds: string[];
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  for (let i = 0; i < input.orderedIds.length; i++) {
    const { error } = await db
      .from("job_closure_reasons")
      .update({ position: (i + 1) * 10 })
      .eq("id", input.orderedIds[i]);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  }
  revalidate();
  return { ok: true };
}
