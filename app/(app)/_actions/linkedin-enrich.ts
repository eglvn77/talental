"use server";

import { revalidatePath } from "next/cache";
import {
  hiring,
  getRequestWorkspaceId,
  type CandidateSource,
} from "@/lib/hiring";
import {
  canonicalizeLinkedinUrl as normalizeLinkedinUrl,
} from "@/lib/linkedin";
import { findOrCreateCandidateFromLinkedin } from "@/lib/sourcing/coresignal";
import { requireCurrentTeamMember } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { type ActionResult } from "./_shared";

/**
 * Enrich one or more LinkedIn URLs and persist as candidates.
 * Optionally attach each to a job (creates applications at the
 * first pipeline stage).
 *
 * Backed by Coresignal Clean Employee. URLs that already exist as
 * candidates in this workspace return as "reused" — no credits spent
 * until the per-candidate cache TTL elapses.
 *
 * DataForB2B has been retired. The work-email / personal-email /
 * phone opt-ins it exposed are no longer available; those flags on
 * the input are silently ignored so existing callers don't break.
 */
export type EnrichResultItem =
  | { kind: "created"; url: string; candidateId: string; name: string }
  | { kind: "reused"; url: string; candidateId: string; name: string }
  | { kind: "error"; url: string; error: string };

const MAX_URLS = 25;

function looksLikeLinkedinUrl(input: string): boolean {
  return /^https?:\/\/(?:www\.)?linkedin\.com\/in\//i.test(input.trim());
}

export async function enrichFromLinkedinAction(input: {
  urls: string[];
  /** When set, also create an application for this job. */
  attachToJobId?: string;
  /** Target stage for the application. Defaults to the job's first stage. */
  attachStageId?: string | null;
  /** Candidate/application source. Defaults to "linkedin". */
  source?: CandidateSource;
  /** @deprecated — DfB2B email enrichment retired. Flag ignored. */
  enrichWorkEmail?: boolean;
  /** @deprecated — DfB2B email enrichment retired. Flag ignored. */
  enrichPersonalEmail?: boolean;
  /** @deprecated — DfB2B phone enrichment retired. Flag ignored. */
  enrichPhone?: boolean;
}): Promise<ActionResult<{ results: EnrichResultItem[] }>> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;
  const createdByTeamMemberId = guard.data.id;
  const t = await getT();

  const urls = input.urls
    .map((u) => u.trim())
    .filter((u) => u.length > 0)
    .map((u) => normalizeLinkedinUrl(u) ?? u);

  if (urls.length === 0) {
    return { ok: false, error: t("errors.enrichPasteUrl") };
  }
  if (urls.length > MAX_URLS) {
    return {
      ok: false,
      error: t("errors.enrichMaxUrls", { max: MAX_URLS }),
    };
  }
  const invalid = urls.find((u) => !looksLikeLinkedinUrl(u));
  if (invalid) {
    return {
      ok: false,
      error: t("errors.enrichNotLinkedin", { url: invalid.slice(0, 80) }),
    };
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Resolve the target stage once — the one the user picked when valid,
  // otherwise the job's first stage.
  let firstStageId: string | null = null;
  if (input.attachToJobId) {
    if (input.attachStageId) {
      const { data: picked } = await db
        .from("pipeline_stages")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("job_id", input.attachToJobId)
        .eq("id", input.attachStageId)
        .maybeSingle();
      firstStageId = (picked?.id as string | undefined) ?? null;
    }
    if (!firstStageId) {
      const { data: stages } = await db
        .from("pipeline_stages")
        .select("id, position")
        .eq("job_id", input.attachToJobId)
        .order("position", { ascending: true })
        .limit(1);
      firstStageId = (stages?.[0]?.id as string | undefined) ?? null;
    }
    if (!firstStageId) {
      return {
        ok: false,
        error: t("errors.jobNoStages"),
      };
    }
  }

  const results: EnrichResultItem[] = [];

  // Sequential to respect Coresignal rate limits + keep failures
  // attributable. Each call is cheap on a cache hit.
  for (const url of urls) {
    const res = await findOrCreateCandidateFromLinkedin({
      linkedinUrl: url,
      createdByTeamMemberId,
    });
    if (!res.ok) {
      results.push({ kind: "error", url, error: res.error });
      continue;
    }

    if (firstStageId && input.attachToJobId) {
      await attachIfMissing(db, {
        candidateId: res.data.id,
        jobId: input.attachToJobId,
        stageId: firstStageId,
        workspaceId,
        source: input.source,
      });
    }

    results.push({
      kind: res.cacheHit ? "reused" : "created",
      url,
      candidateId: res.data.id,
      name: res.data.full_name,
    });
  }

  if (input.attachToJobId) {
    revalidatePath(`/jobs/${input.attachToJobId}`);
  }
  revalidatePath("/candidates");
  return { ok: true, data: { results } };
}

async function attachIfMissing(
  db: Awaited<ReturnType<typeof hiring>>,
  input: {
    candidateId: string;
    jobId: string;
    stageId: string;
    workspaceId: string;
    source?: CandidateSource;
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
    source: input.source ?? "linkedin",
    source_meta: { sourcer: "coresignal" },
  });
}

/**
 * Cascade enrichment for an existing candidate. Used by the slim
 * side-panel "Reenriquecer" button.
 *
 *   1. Try Coresignal (cheap, no LinkedIn touch).
 *   2. If Coresignal !ok (very common — their index isn't
 *      exhaustive), try Unipile via the recruiter's connected
 *      LinkedIn account.
 *   3. Return whichever succeeded; surface error only when both
 *      fail.
 *
 * Different from enrichFromLinkedinAction (which is the bulk
 * paste-URLs flow) — this works on an EXISTING candidateId.
 */
export async function enrichCandidateCascadeAction(
  candidateId: string,
): Promise<
  | { ok: true; via: "coresignal" | "unipile" }
  | { ok: false; error: string }
> {
  const guard = await requireCurrentTeamMember();
  if (!guard.ok) return guard;

  const { enrichCandidateFromLinkedin } = await import(
    "@/lib/sourcing/coresignal"
  );
  const cs = await enrichCandidateFromLinkedin(candidateId, {
    forceRefresh: true,
  });
  if (cs.ok) {
    revalidatePath(`/candidates`);
    revalidatePath(`/extension/candidate-view`);
    return { ok: true, via: "coresignal" };
  }

  // Coresignal failed — try Unipile.
  const { enrichCandidateViaUnipile } = await import(
    "@/lib/integrations/unipile/profile"
  );
  const up = await enrichCandidateViaUnipile(candidateId);
  if (up.ok) {
    revalidatePath(`/candidates`);
    revalidatePath(`/extension/candidate-view`);
    return { ok: true, via: "unipile" };
  }

  // Both failed.
  return {
    ok: false,
    error: `Coresignal: ${cs.error}. Unipile: ${up.error}`,
  };
}
