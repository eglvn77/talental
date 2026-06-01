import "server-only";

import { hiring, type SourceRow } from "@/lib/hiring";

/** Which list a source belongs to — candidates vs companies. */
export type SourceScope = "candidate" | "company";

const FALLBACK_COLOR = "#94a3b8";

/**
 * Workspace-scoped Source/Origen options for one scope, ordered by the
 * admin-defined position. RLS scopes to the caller's workspace.
 */
export async function loadSources(scope: SourceScope): Promise<SourceRow[]> {
  const db = await hiring();
  const { data } = await db
    .from("sources")
    .select("*")
    .eq("scope", scope)
    .order("position", { ascending: true });
  return (data ?? []) as SourceRow[];
}

/** id → { label, color } for rendering a source chip. */
export function sourceMap(
  rows: SourceRow[],
): Record<string, { label: string; color: string }> {
  const out: Record<string, { label: string; color: string }> = {};
  for (const r of rows) {
    out[r.id] = { label: r.label, color: r.color ?? FALLBACK_COLOR };
  }
  return out;
}

/** Resolve a candidate source id from a stable key (careers ?src= → id). */
export async function resolveCandidateSourceIdByKey(
  key: string,
): Promise<string | null> {
  const db = await hiring();
  const { data } = await db
    .from("sources")
    .select("id")
    .eq("scope", "candidate")
    .eq("key", key)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
