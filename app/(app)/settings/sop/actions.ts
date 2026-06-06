"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/team";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Save the SOP template for the current workspace.
 *
 * The whole template_json is replaced on every call — the editor
 * always sends the full {phases, items} payload. Single admin
 * concurrency assumption: workspace owners aren't multiplexing this
 * page. If that ever changes we add row-level locking + an
 * optimistic-concurrency token on the definition.
 *
 * Validation is conservative — we accept a shape close to the
 * runtime parser in lib/sop/loader.ts. Unknown fields get dropped
 * so a stale client can't write garbage.
 */
export async function updateSopTemplateAction(input: {
  phases: Array<{ key: string; label_es: string; label_en: string }>;
  items: Array<{
    id: string;
    phase: string;
    indent: number;
    label_es: string;
    label_en: string;
  }>;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  // ── Validation. Surfaces back to the client as `ok:false`. ──────────
  const slugRe = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const phaseKeys = new Set<string>();
  const phases: Array<{ key: string; label_es: string; label_en: string }> = [];
  for (const p of input.phases) {
    const key = String(p.key ?? "").trim().toLowerCase();
    if (!slugRe.test(key)) {
      return { ok: false, error: `Invalid phase key: "${key}"` };
    }
    if (phaseKeys.has(key)) {
      return { ok: false, error: `Duplicate phase key: "${key}"` };
    }
    phaseKeys.add(key);
    phases.push({
      key,
      label_es: String(p.label_es ?? "").trim() || key,
      label_en: String(p.label_en ?? "").trim() || key,
    });
  }

  const itemIds = new Set<string>();
  const items: Array<{
    id: string;
    phase: string;
    indent: number;
    label_es: string;
    label_en: string;
  }> = [];
  for (const it of input.items) {
    const id = String(it.id ?? "").trim();
    if (!slugRe.test(id)) {
      return { ok: false, error: `Invalid item id: "${id}"` };
    }
    if (itemIds.has(id)) {
      return { ok: false, error: `Duplicate item id: "${id}"` };
    }
    itemIds.add(id);
    const phase = String(it.phase ?? "").trim().toLowerCase();
    if (!phaseKeys.has(phase)) {
      return {
        ok: false,
        error: `Item "${id}" references unknown phase "${phase}"`,
      };
    }
    const label_es = String(it.label_es ?? "").trim();
    const label_en = String(it.label_en ?? "").trim();
    if (!label_es && !label_en) {
      return { ok: false, error: `Item "${id}" needs at least one label` };
    }
    items.push({
      id,
      phase,
      indent: it.indent === 1 ? 1 : 0,
      label_es,
      label_en,
    });
  }

  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  // Find the workspace's SOP definition. is_system row protected by
  // the trigger — but we only touch template_json, which the trigger
  // explicitly leaves editable.
  const { data: defRow, error: defErr } = await db
    .from("resource_definitions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("key", "sop")
    .maybeSingle();
  if (defErr) return { ok: false, error: defErr.message.slice(0, 300) };
  if (!defRow) return { ok: false, error: "Workspace has no SOP definition" };

  const { error } = await db
    .from("resource_definitions")
    .update({ template_json: { phases, items } })
    .eq("id", (defRow as { id: string }).id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath("/settings/sop");
  revalidatePath("/jobs"); // SOP rendering is on per-job pages
  return { ok: true };
}
