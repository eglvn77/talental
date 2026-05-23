"use server";

import { revalidatePath } from "next/cache";
import {
  hiring,
  getRequestWorkspaceId,
} from "@/lib/hiring";
import {
  getCandidate,
  getCompany,
  enrichCandidateEmail,
  looksLikeLinkedinUrl,
  normalizeLinkedinUrl,
} from "@/lib/sourcing/dataforb2b";
import type { ParsedProfile } from "@/lib/resume-parse";
import { ensureAdmin, type ActionResult } from "./_shared";

/**
 * Enrich one or more LinkedIn URLs and persist as candidates.
 * Optionally attach each to a job (creates applications at the
 * first pipeline stage).
 *
 * Goes through the cache-first wrapper (lib/sourcing/dataforb2b) for
 * every API call. URLs that already exist as cached rows return as
 * "reused" — no credits spent. Newly enriched candidates also trigger
 * company-by-company enrichment for each entry in their experience,
 * again cache-first (a Stripe alum import won't re-enrich Stripe).
 */
export type EnrichResultItem =
  | { kind: "created"; url: string; candidateId: string; name: string }
  | { kind: "reused"; url: string; candidateId: string; name: string }
  | { kind: "error"; url: string; error: string };

const MAX_URLS = 25;

export async function enrichFromLinkedinAction(input: {
  urls: string[];
  /** When set, also create an application for this job at first stage. */
  attachToJobId?: string;
  enrichWorkEmail?: boolean;
  enrichPersonalEmail?: boolean;
  /** Phone opt-in (10 credits) — UI surfaces this separately. */
  enrichPhone?: boolean;
}): Promise<ActionResult<{ results: EnrichResultItem[] }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;

  const urls = input.urls
    .map((u) => u.trim())
    .filter((u) => u.length > 0)
    .map(normalizeLinkedinUrl);

  if (urls.length === 0) {
    return { ok: false, error: "Pega al menos una URL." };
  }
  if (urls.length > MAX_URLS) {
    return {
      ok: false,
      error: `Máximo ${MAX_URLS} URLs por batch. Divide la lista.`,
    };
  }
  const invalid = urls.find((u) => !looksLikeLinkedinUrl(u));
  if (invalid) {
    return {
      ok: false,
      error: `URL no parece de LinkedIn: ${invalid.slice(0, 80)}`,
    };
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Resolve the job's first pipeline stage once.
  let firstStageId: string | null = null;
  if (input.attachToJobId) {
    const { data: stages } = await db
      .from("pipeline_stages")
      .select("id, position")
      .eq("job_id", input.attachToJobId)
      .order("position", { ascending: true })
      .limit(1);
    firstStageId = (stages?.[0]?.id as string | undefined) ?? null;
    if (!firstStageId) {
      return {
        ok: false,
        error:
          "La vacante no tiene stages configurados. Crea el pipeline primero.",
      };
    }
  }

  const results: EnrichResultItem[] = [];

  // Sequential to respect rate limits. The wrapper handles cache
  // checks internally, so re-running with the same URLs is cheap.
  for (const url of urls) {
    try {
      const res = await getCandidate({ linkedinUrl: url });

      // Email opt-ins: triggered only if explicitly requested AND we
      // either don't have an email or the existing one is stale.
      if (input.enrichWorkEmail) {
        await enrichCandidateEmail(res.data.id, { kind: "work" });
      }
      if (input.enrichPersonalEmail) {
        await enrichCandidateEmail(res.data.id, { kind: "personal" });
      }

      // Newly enriched candidates: enrich each company in their
      // experience so the chip in the slideover has hover data.
      if (!res.cacheHit) {
        await attachCompaniesToCandidate(res.data.id, workspaceId);
      }

      // Attach to the target vacancy if requested.
      if (firstStageId && input.attachToJobId) {
        await attachIfMissing(db, {
          candidateId: res.data.id,
          jobId: input.attachToJobId,
          stageId: firstStageId,
          workspaceId,
        });
      }

      results.push({
        kind: res.cacheHit ? "reused" : "created",
        url,
        candidateId: res.data.id,
        name: res.data.full_name,
      });
    } catch (e) {
      results.push({
        kind: "error",
        url,
        error: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
    }
  }

  if (input.attachToJobId) {
    revalidatePath(`/jobs/${input.attachToJobId}`);
  }
  revalidatePath("/candidates");
  return { ok: true, data: { results } };
}

/**
 * Walk a newly enriched candidate's experience and resolve each
 * company through the cache-first wrapper. Updates the candidate's
 * parsed_profile in place with company_id refs so the slideover's
 * company chip works.
 */
async function attachCompaniesToCandidate(
  candidateId: string,
  workspaceId: string,
): Promise<void> {
  const db = await hiring();
  const { data: cand } = await db
    .from("candidates")
    .select("id, parsed_profile")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand?.parsed_profile) return;

  const profile = cand.parsed_profile as ParsedProfile;
  const experience = profile.experience ?? [];
  if (experience.length === 0) return;

  const updated = [...experience];
  let mutated = false;

  for (let i = 0; i < updated.length; i++) {
    const exp = updated[i];
    const name = exp.company?.trim();
    if (!name || exp.company_id) continue;

    try {
      // We don't have the company's LinkedIn URL on the parsed profile
      // (raw_client returned it in `experience[].company.url` but we
      // don't carry it through). Fall back to the company name; the
      // wrapper's getCompany handles it via slug-best-effort.
      const result = await getCompany(name, { hintName: name });
      updated[i] = { ...exp, company_id: result.data.id };
      mutated = true;
    } catch {
      // Best-effort: skip companies we can't enrich. Candidate still
      // gets created.
    }
  }

  if (mutated) {
    const nextProfile = { ...profile, experience: updated };
    await db
      .from("candidates")
      .update({ parsed_profile: nextProfile })
      .eq("id", candidateId);
  }
  // Silence the unused-warning for workspaceId in the partial path.
  void workspaceId;
}

async function attachIfMissing(
  db: Awaited<ReturnType<typeof hiring>>,
  input: {
    candidateId: string;
    jobId: string;
    stageId: string;
    workspaceId: string;
  },
): Promise<void> {
  const { data: existing } = await db
    .from("applications")
    .select("id")
    .eq("candidate_id", input.candidateId)
    .eq("job_id", input.jobId)
    .maybeSingle();
  if (existing) return;
  await db.from("applications").insert({
    workspace_id: input.workspaceId,
    candidate_id: input.candidateId,
    job_id: input.jobId,
    stage_id: input.stageId,
    source: "linkedin",
    source_meta: { sourcer: "dataforb2b" },
  });
}
