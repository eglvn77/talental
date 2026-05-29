import "server-only";

import { hiring, type CompanyStatusRow } from "@/lib/hiring";

/**
 * Workspace-scoped company statuses (hiring.company_statuses). Replaces
 * the old fixed enum + jsonb display-override model. Each workspace
 * defines its own CRM classifications in /settings/job-statuses; they
 * are fully editable (rename / recolor / reorder / delete).
 */

export type CompanyStatusDisplay = { label: string; color: string };

const FALLBACK_COLOR = "#94a3b8";

/**
 * All company statuses for the caller's workspace, ordered by the
 * admin-defined position. RLS scopes this to the auth'd workspace.
 */
export async function loadCompanyStatuses(): Promise<CompanyStatusRow[]> {
  const db = await hiring();
  const { data } = await db
    .from("company_statuses")
    .select("*")
    .order("position", { ascending: true });
  return (data ?? []) as CompanyStatusRow[];
}

/**
 * Build a key → { label, color } map for O(1) lookup when rendering a
 * company's status chip. Unknown keys fall back to the stone color.
 */
export function companyStatusMap(
  rows: CompanyStatusRow[],
): Record<string, CompanyStatusDisplay> {
  const out: Record<string, CompanyStatusDisplay> = {};
  for (const r of rows) {
    out[r.key] = { label: r.label, color: r.color ?? FALLBACK_COLOR };
  }
  return out;
}

/** Display for a single key against a loaded map, with a safe default
 *  so a deleted/renamed key never blanks the UI. */
export function resolveCompanyStatusDisplay(
  map: Record<string, CompanyStatusDisplay>,
  key: string | null | undefined,
): CompanyStatusDisplay {
  if (key && map[key]) return map[key];
  return { label: key ?? "—", color: FALLBACK_COLOR };
}

/**
 * Default status key for newly-created companies: the first row by
 * position. There is no DB-level default anymore (the column is just
 * NOT NULL), so every insert path must resolve this. Returns null only
 * for a workspace with zero statuses (shouldn't happen — the seed +
 * the last-remaining delete guard keep ≥1).
 */
export async function resolveDefaultCompanyStatusKey(): Promise<string | null> {
  const rows = await loadCompanyStatuses();
  return rows[0]?.key ?? null;
}
