import "server-only";

import { hiring } from "@/lib/hiring";

/**
 * Server-only path for creating a custom (non-system)
 * resource_definition from AI output. Used by `lib/kickoff/persist.ts`
 * when the master prompt asks Claude to emit an `additional_sections`
 * entry alongside the standard 7.
 *
 * The user-facing /settings/resources UI was retired — the master
 * kickoff prompt is the single source of truth for what sections
 * exist + what they contain. This util preserves the existing DB
 * shape (resource_definitions row + auto-slug) without dragging the
 * full server-action through into the deleted page.
 */

type Db = Awaited<ReturnType<typeof hiring>>;

export type CreateFromAiArgs = {
  db: Db;
  workspaceId: string;
  label: string;
  kind: "markdown" | "list" | "structured" | "checklist";
};

export type CreateFromAiResult =
  | { ok: true; id: string; key: string; created: boolean }
  | { ok: false; error: string };

/** Slug helper — turn a free-text label into a slug. Strips
 *  diacritics, lowercases, replaces non-alphanumerics with hyphens,
 *  trims edges. Returns "" when the label has no alphanumerics
 *  (caller falls back to a timestamp-derived id). */
function slugifyLabel(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Idempotent: if a definition with the same `label` already exists
 * for the workspace, return its id without creating a new row. This
 * lets the kickoff re-run on the same vacante without piling up
 * duplicate sections.
 *
 * `key` is auto-derived from the label; collisions get -2/-3 suffix.
 * `position` lands at the end of the workspace's list.
 */
export async function createResourceDefinitionFromAi(
  args: CreateFromAiArgs,
): Promise<CreateFromAiResult> {
  const label = args.label.trim();
  if (!label) return { ok: false, error: "Label cannot be empty" };
  if (label.length > 80) {
    return { ok: false, error: "Label too long (max 80 chars)" };
  }
  const allowedKinds = ["markdown", "list", "structured", "checklist"] as const;
  if (!(allowedKinds as readonly string[]).includes(args.kind)) {
    return { ok: false, error: `Invalid kind: ${args.kind}` };
  }

  // Same-label dedupe — we treat label as the human identifier here
  // because the slug is derived from it. Different labels → distinct
  // definitions; same label → reuse.
  const { data: dupe } = await args.db
    .from("resource_definitions")
    .select("id, key")
    .eq("workspace_id", args.workspaceId)
    .eq("label", label)
    .maybeSingle();
  if (dupe) {
    return {
      ok: true,
      id: (dupe as { id: string }).id,
      key: (dupe as { key: string }).key,
      created: false,
    };
  }

  // Auto-slug + collision-resistant suffix.
  const base = slugifyLabel(label) || `resource-${Date.now().toString(36)}`;
  let key = base;
  let attempt = 2;
  while (attempt < 100) {
    const { data: existing } = await args.db
      .from("resource_definitions")
      .select("id")
      .eq("workspace_id", args.workspaceId)
      .eq("key", key)
      .maybeSingle();
    if (!existing) break;
    key = `${base}-${attempt}`;
    attempt += 1;
  }

  const { data: maxRow } = await args.db
    .from("resource_definitions")
    .select("position")
    .eq("workspace_id", args.workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition =
    typeof maxRow?.position === "number" ? maxRow.position + 1 : 0;

  const { data, error } = await args.db
    .from("resource_definitions")
    .insert({
      workspace_id: args.workspaceId,
      key,
      label,
      kind: args.kind,
      position: nextPosition,
      is_system: false,
      is_enabled: true,
      schema_json: {},
      generator_prompt: "",
      template_json: {},
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return {
    ok: true,
    id: (data as { id: string }).id,
    key,
    created: true,
  };
}
