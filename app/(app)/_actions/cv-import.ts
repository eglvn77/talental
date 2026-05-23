"use server";

import { hiring } from "@/lib/hiring";
import { ensureAdmin, type ActionResult } from "./_shared";

/**
 * Cheap dedup probe: given a list of emails, return which already
 * exist in this workspace's candidates table. The review step uses
 * this to mark cards with "Ya existe" + offer the recruiter the
 * choice to update / create new / skip.
 *
 * Workspace scoping comes from RLS on hiring.candidates (the
 * authenticated client only sees its own rows). We narrow further by
 * the email IN filter.
 *
 * Returns { id, email, full_name, linkedin_url } per match so the
 * UI can show enough context to disambiguate.
 */
export async function findExistingCandidatesByEmailAction(
  emails: string[],
): Promise<
  ActionResult<{
    matches: Array<{
      id: string;
      email: string;
      full_name: string;
      linkedin_url: string | null;
    }>;
  }>
> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const cleaned = Array.from(
    new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes("@")),
    ),
  );
  if (cleaned.length === 0) {
    return { ok: true, data: { matches: [] } };
  }
  const db = await hiring();
  const { data, error } = await db
    .from("candidates")
    .select("id, email, full_name, linkedin_url")
    .in("email", cleaned);
  if (error) {
    return { ok: false, error: error.message.slice(0, 200) };
  }
  return {
    ok: true,
    data: {
      matches: (data ?? []) as Array<{
        id: string;
        email: string;
        full_name: string;
        linkedin_url: string | null;
      }>,
    },
  };
}
