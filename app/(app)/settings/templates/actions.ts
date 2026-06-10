"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { requireAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function normalizeSubject(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export async function createMessageTemplateAction(input: {
  name: string;
  subject?: string | null;
  content: string;
}): Promise<ActionResult<{ id: string }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const t = await getT();
  const name = input.name.trim();
  if (!name) return { ok: false, error: t("errors.nameRequired") };
  const content = input.content ?? "";
  if (!content.trim()) return { ok: false, error: t("templatesCfg.contentRequired") };

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Append to the end of the list.
  const { data: maxRow } = await db
    .from("message_templates")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | undefined) ?? 0) + 10;

  const { data, error } = await db
    .from("message_templates")
    .insert({
      workspace_id: workspaceId,
      name,
      subject: normalizeSubject(input.subject),
      content,
      position: nextPosition,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || t("errors.createFailed"),
    };
  }
  revalidatePath("/settings/templates");
  return { ok: true, data: { id: data.id as string } };
}

export async function updateMessageTemplateAction(input: {
  id: string;
  name?: string;
  subject?: string | null;
  content?: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const t = await getT();
  const db = await hiring();

  const patch: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) return { ok: false, error: t("errors.nameRequired") };
    patch.name = name;
  }
  if (input.subject !== undefined) patch.subject = normalizeSubject(input.subject);
  if (typeof input.content === "string") {
    if (!input.content.trim())
      return { ok: false, error: t("templatesCfg.contentRequired") };
    patch.content = input.content;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await db
    .from("message_templates")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/templates");
  return { ok: true };
}

export async function deleteMessageTemplateAction(input: {
  id: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { error } = await db
    .from("message_templates")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/templates");
  return { ok: true };
}
