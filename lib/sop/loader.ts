import "server-only";

import type { hiring } from "@/lib/hiring";

/**
 * SOP template + per-job done-state loader (Phase 3b-SOP-2).
 *
 * Before the rebuild: SOP_TEMPLATE was hardcoded in lib/sop/template.ts
 * and the per-job done-state lived in hiring.tasks rows tagged with
 * the `<!-- sop:v1 | item: ID -->` marker.
 *
 * After: the template is workspace-customizable, stored in
 * `hiring.resource_definitions.template_json` for the seeded
 * `key='sop'` row. The per-job done-state is one `resource_values`
 * row whose `value.checked` is an array of done item-ids.
 *
 * Orphans (items in the template a job has never toggled OR items
 * still in a job's checked[] after a template prune) are both
 * harmless: missing keys default to false; stale ids never render.
 */

export type SopTemplateItem = {
  id: string;
  phase: string;
  indent: 0 | 1;
  label_es: string;
  label_en: string;
};

export type SopTemplatePhase = {
  key: string;
  label_es: string;
  label_en: string;
};

export type SopTemplate = {
  phases: SopTemplatePhase[];
  items: SopTemplateItem[];
};

export type LoadedSop = {
  /** definition_id of the workspace's sop row (used by toggle action). */
  definitionId: string;
  template: SopTemplate;
  checked: Set<string>;
};

type Db = Awaited<ReturnType<typeof hiring>>;

function parseTemplate(raw: unknown): SopTemplate {
  // Defensive — admin edits could leave an odd shape; default to empty
  // arrays so the UI still renders rather than crashing.
  const j = (raw ?? {}) as { phases?: unknown; items?: unknown };
  const phases: SopTemplatePhase[] = Array.isArray(j.phases)
    ? (j.phases as Array<Partial<SopTemplatePhase>>)
        .filter((p) => typeof p?.key === "string")
        .map((p) => ({
          key: String(p.key),
          label_es: String(p.label_es ?? p.key ?? ""),
          label_en: String(p.label_en ?? p.key ?? ""),
        }))
    : [];
  const items: SopTemplateItem[] = Array.isArray(j.items)
    ? (j.items as Array<Partial<SopTemplateItem>>)
        .filter((it) => typeof it?.id === "string")
        .map((it) => ({
          id: String(it.id),
          phase: String(it.phase ?? ""),
          indent: it.indent === 1 ? 1 : 0,
          label_es: String(it.label_es ?? ""),
          label_en: String(it.label_en ?? ""),
        }))
    : [];
  return { phases, items };
}

function parseChecked(raw: unknown): Set<string> {
  const v = (raw ?? {}) as { checked?: unknown };
  if (!Array.isArray(v.checked)) return new Set();
  return new Set(
    (v.checked as unknown[]).filter((x): x is string => typeof x === "string"),
  );
}

/**
 * Load the SOP for a job in one round-trip-ish pair of queries. Returns
 * the workspace template + the set of checked item-ids. Throws if the
 * workspace has no `sop` definition (should be impossible — seeded
 * automatically; if it's missing the workspace creation didn't run the
 * trigger).
 */
export async function loadSopForJob(args: {
  db: Db;
  workspaceId: string;
  jobId: string;
}): Promise<LoadedSop> {
  const { db, workspaceId, jobId } = args;

  const { data: defRow, error: defErr } = await db
    .from("resource_definitions")
    .select("id, template_json")
    .eq("workspace_id", workspaceId)
    .eq("key", "sop")
    .maybeSingle();
  if (defErr) throw new Error(`load sop definition: ${defErr.message}`);
  if (!defRow) throw new Error("workspace has no 'sop' resource_definition");

  const { data: valRow, error: valErr } = await db
    .from("resource_values")
    .select("value")
    .eq("job_id", jobId)
    .eq("definition_id", defRow.id as string)
    .maybeSingle();
  if (valErr) throw new Error(`load sop value: ${valErr.message}`);

  return {
    definitionId: defRow.id as string,
    template: parseTemplate(defRow.template_json),
    checked: parseChecked(valRow?.value),
  };
}
