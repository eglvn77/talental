"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { requireAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import type { SourceScope } from "@/lib/sources";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function sanitizeHex(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return HEX.test(t) ? t : null;
}

function slugFromLabel(label: string): string {
  const s = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "source";
}

function revalidate() {
  revalidatePath("/settings/sources/candidate");
  revalidatePath("/settings/sources/company");
  revalidatePath("/candidates");
  revalidatePath("/companies");
}

export async function createSourceAction(input: {
  scope: SourceScope;
  label: string;
  color?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const t = await getT();
  const label = input.label.trim();
  if (!label) return { ok: false, error: t("errors.nameRequired") };
  if (label.length > 40) return { ok: false, error: t("errors.max40Chars") };
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: maxRow } = await db
    .from("sources")
    .select("position")
    .eq("scope", input.scope)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | undefined) ?? 0) + 10;

  // Unique key within (workspace, scope).
  const base = slugFromLabel(label);
  let key = base;
  let suffix = 1;
  while (true) {
    const { data: clash } = await db
      .from("sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("scope", input.scope)
      .eq("key", key)
      .maybeSingle();
    if (!clash) break;
    suffix += 1;
    key = `${base}_${suffix}`;
  }

  const { data, error } = await db
    .from("sources")
    .insert({
      workspace_id: workspaceId,
      scope: input.scope,
      key,
      label,
      color: sanitizeHex(input.color) ?? "#94a3b8",
      position: nextPosition,
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

export async function updateSourceAction(input: {
  id: string;
  label?: string;
  color?: string | null;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const patch: Record<string, unknown> = {};
  if (typeof input.label === "string") {
    const t = await getT();
    const trimmed = input.label.trim();
    if (!trimmed) return { ok: false, error: t("errors.nameRequired") };
    if (trimmed.length > 40) return { ok: false, error: t("errors.max40Chars") };
    patch.label = trimmed;
  }
  if (input.color !== undefined) patch.color = sanitizeHex(input.color);
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await db.from("sources").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidate();
  return { ok: true };
}

/** Delete a source. The FK on candidates/companies is ON DELETE SET NULL,
 *  so deleting just clears the origin on any entity that used it. */
export async function deleteSourceAction(input: {
  id: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { error } = await db.from("sources").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidate();
  return { ok: true };
}

export async function reorderSourcesAction(input: {
  orderedIds: string[];
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  for (let i = 0; i < input.orderedIds.length; i++) {
    const { error } = await db
      .from("sources")
      .update({ position: (i + 1) * 10 })
      .eq("id", input.orderedIds[i]);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  }
  revalidate();
  return { ok: true };
}
