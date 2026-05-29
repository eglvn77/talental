"use server";

import { revalidatePath } from "next/cache";
import { hiring } from "@/lib/hiring";
import { ensureAdmin, type ActionResult } from "./_shared";

/**
 * Candidate de-duplication. Exact email/linkedin dupes are impossible
 * (per-workspace unique indexes), so this targets same-person rows that
 * slipped past — detected by normalized full_name via the
 * hiring.candidate_duplicate_groups() RPC — and folds two into one with
 * the field-by-field merge RPC (hiring.merge_candidates).
 */

export type DuplicateCandidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  headline: string | null;
  summary: string | null;
  current_company_name: string | null;
  current_position: string | null;
  location: string | null;
  profile_picture_url: string | null;
  resume_url: string | null;
  created_at: string;
  enrichment_status: string | null;
  /** How many vacante pipelines this candidate sits in — helps the
   *  recruiter pick which row survives. */
  application_count: number;
};

export type DuplicateGroup = {
  /** Normalized name the group matched on (display hint). */
  matchKey: string;
  candidates: DuplicateCandidate[];
};

const SUMMARY_COLS =
  "id, full_name, email, phone, linkedin_url, headline, summary, current_company_name, current_position, location, profile_picture_url, resume_url, created_at, enrichment_status";

/** Find likely-duplicate candidate groups in the caller's workspace. */
export async function findCandidateDuplicatesAction(): Promise<
  ActionResult<{ groups: DuplicateGroup[] }>
> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();

  const { data: rawGroups, error } = await db.rpc(
    "candidate_duplicate_groups",
    { p_limit: 100 },
  );
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  const groups = (rawGroups ?? []) as Array<{
    match_key: string;
    n: number;
    candidate_ids: string[];
  }>;
  const allIds = Array.from(
    new Set(groups.flatMap((g) => g.candidate_ids)),
  );
  if (allIds.length === 0) return { ok: true, data: { groups: [] } };

  const [{ data: cands }, { data: apps }] = await Promise.all([
    db.from("candidates").select(SUMMARY_COLS).in("id", allIds),
    db.from("applications").select("candidate_id").in("candidate_id", allIds),
  ]);

  const countById = new Map<string, number>();
  for (const a of (apps ?? []) as Array<{ candidate_id: string }>) {
    countById.set(a.candidate_id, (countById.get(a.candidate_id) ?? 0) + 1);
  }
  const byId = new Map(
    ((cands ?? []) as Array<Record<string, unknown>>).map((c) => [
      c.id as string,
      c,
    ]),
  );

  const out: DuplicateGroup[] = [];
  for (const g of groups) {
    const candidates = g.candidate_ids
      .map((id) => byId.get(id))
      .filter((c): c is Record<string, unknown> => Boolean(c))
      .map((c) => ({
        ...(c as unknown as Omit<DuplicateCandidate, "application_count">),
        application_count: countById.get(c.id as string) ?? 0,
      }));
    if (candidates.length >= 2) {
      out.push({ matchKey: g.match_key, candidates });
    }
  }
  return { ok: true, data: { groups: out } };
}

/** Pickable scalar fields the UI resolves field-by-field. */
export type MergeFields = Partial<{
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  headline: string | null;
  summary: string | null;
  current_company_name: string | null;
  current_position: string | null;
  location: string | null;
  profile_picture_url: string | null;
  resume_url: string | null;
}>;

/**
 * Merge `secondaryId` into `primaryId`. `fields` carries the recruiter's
 * field-by-field choices (the survivor keeps `primaryId`'s row/id and
 * application history; every scalar is whatever they picked). Children
 * (applications, experience, skills, notes, tags…) are unioned. The RPC
 * runs in one transaction and re-checks admin authorization server-side.
 */
export async function mergeCandidatesAction(input: {
  primaryId: string;
  secondaryId: string;
  fields?: MergeFields;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  if (input.primaryId === input.secondaryId) {
    return { ok: false, error: "No se puede fusionar un candidato consigo mismo." };
  }
  const db = await hiring();
  const { error } = await db.rpc("merge_candidates", {
    p_primary: input.primaryId,
    p_secondary: input.secondaryId,
    p_fields: (input.fields ?? {}) as Record<string, string | null>,
  });
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/candidates");
  return { ok: true };
}
