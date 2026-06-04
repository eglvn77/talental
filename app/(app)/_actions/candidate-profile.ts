"use server";

import { revalidatePath } from "next/cache";
import { hiring } from "@/lib/hiring";
import { ensureAdmin, type ActionResult } from "./_shared";

/**
 * Inline-edit single contact fields on a candidate from the talent-pool
 * profile slideover. Each call patches whichever fields are present;
 * undefined keys are ignored.
 *
 * Email + linkedin_url are unique-per-workspace via partial indexes;
 * we let Postgres surface those collisions as the action error.
 */
type ContactPatch = {
  email?: string | null;
  phone?: string | null;
  /** Optional secondary contacts (shown in the UI only when present). */
  email_secondary?: string | null;
  phone_secondary?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_place_id?: string | null;
  /** Customizable Source/Origen (FK to hiring.sources, candidate scope). */
  source_id?: string | null;
  /** Structured compensation (current + expected), each with currency. */
  comp_current_amount?: number | null;
  comp_current_currency?: string | null;
  comp_expected_amount?: number | null;
  comp_expected_currency?: string | null;
  /** Rich-text "Candidate report" — recruiter-authored summary that's
   *  also surfaced in the client portal. */
  candidate_report?: string | null;
};

export async function updateCandidateContactAction(input: {
  candidateId: string;
  patch: ContactPatch;
}): Promise<ActionResult> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;

  // Drop undefined keys; null is a meaningful "clear this field" value.
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) {
    if (v === undefined) continue;
    payload[k] = typeof v === "string" ? v.trim() || null : v;
  }
  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "Nothing to update" };
  }
  // Normalize email lowercase on the server too, defensively.
  if (typeof payload.email === "string") {
    payload.email = (payload.email as string).toLowerCase();
  }
  if (typeof payload.email_secondary === "string") {
    payload.email_secondary = (payload.email_secondary as string).toLowerCase();
  }

  const db = await hiring();
  const { error } = await db
    .from("candidates")
    .update(payload)
    .eq("id", input.candidateId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath("/candidates");
  revalidatePath(`/candidates/${input.candidateId}`);
  return { ok: true };
}
