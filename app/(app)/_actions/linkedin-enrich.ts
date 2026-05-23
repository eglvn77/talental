"use server";

import { revalidatePath } from "next/cache";
import {
  hiring,
  getRequestWorkspaceId,
  DEFAULT_PIPELINE_STAGES,
} from "@/lib/hiring";
import {
  enrichProfile,
  looksLikeLinkedinUrl,
  normalizeLinkedinUrl,
} from "@/lib/dataforb2b/client";
import { toParsedProfile } from "@/lib/dataforb2b/to-parsed-profile";
import {
  newUpsertCache,
  upsertCompanyFromHint,
  type CompanyUpsertCache,
} from "@/lib/dataforb2b/upsert-company";
import type { ParsedProfile } from "@/lib/resume-parse";
import { ensureAdmin, type ActionResult } from "./_shared";

/**
 * Enrich one or more LinkedIn URLs via DataForB2B and persist as
 * candidates. Optionally attach to a job (creates applications at
 * the first pipeline stage).
 *
 * Dedup: if a candidate already exists in the workspace with the same
 * normalized LinkedIn URL OR the same email, skip and (optionally)
 * attach the existing candidate to the job instead.
 *
 * Cost: 1.5 credits per URL by default. +3 work_email, +1 personal_email,
 * +10 phone if those opt-ins are on.
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

  // If attaching to a job, resolve its first stage once (instead of
  // per-URL).
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

  // Pre-check: any URLs that already exist as candidates in this workspace
  // get reused instead of re-enriched (avoids burning credits).
  const { data: existing } = await db
    .from("candidates")
    .select("id, full_name, linkedin_url")
    .in("linkedin_url", urls);
  const existingByUrl = new Map<string, { id: string; name: string }>();
  for (const row of existing ?? []) {
    const r = row as { id: string; full_name: string; linkedin_url: string };
    existingByUrl.set(r.linkedin_url, { id: r.id, name: r.full_name });
  }

  const results: EnrichResultItem[] = [];
  // Single cache for the whole batch: if 10 candidates worked at
  // Stripe, we resolve Stripe once and reuse the company_id for all.
  const companyCache = newUpsertCache();

  // Sequential, not parallel: 25 URLs × ~1.5s each is ~30s total. Running
  // parallel would trip the rate limit quickly and we don't have a
  // documented limit to plan around. Sequential is the boring-correct
  // choice for v1.
  for (const url of urls) {
    try {
      // Reuse path.
      const reuse = existingByUrl.get(url);
      if (reuse) {
        if (firstStageId) {
          await attachIfMissing(db, {
            candidateId: reuse.id,
            jobId: input.attachToJobId!,
            stageId: firstStageId,
            workspaceId,
          });
        }
        results.push({
          kind: "reused",
          url,
          candidateId: reuse.id,
          name: reuse.name,
        });
        continue;
      }

      // Enrich + insert.
      const enriched = await enrichProfile(url, {
        enrich_work_email: input.enrichWorkEmail,
        enrich_personal_email: input.enrichPersonalEmail,
        enrich_phone: input.enrichPhone,
      });
      const parsed = toParsedProfile(enriched);
      const fullName = parsed.full_name?.trim();
      if (!fullName) {
        results.push({
          kind: "error",
          url,
          error: "Perfil sin nombre — saltado.",
        });
        continue;
      }

      // Resolve company_id for each experience entry BEFORE inserting
      // the candidate, so parsed_profile is saved with the FK refs
      // already populated (no second-pass UPDATE needed).
      //
      // Note: we read the DfB2B response's experience[].company.{id,url}
      // directly because parsed.experience only carries name + logo.
      const parsedWithCompanyIds = await attachCompanyIds(
        parsed,
        enriched.profile.experience ?? [],
        workspaceId,
        companyCache,
      );

      const { data: candidate, error: insErr } = await db
        .from("candidates")
        .insert({
          workspace_id: workspaceId,
          full_name: fullName.slice(0, 200),
          email: parsed.email?.toLowerCase() ?? null,
          phone: parsed.phone ?? null,
          linkedin_url: url,
          default_source: "linkedin",
          parsed_profile: parsedWithCompanyIds,
        })
        .select("id, full_name")
        .single();

      if (insErr || !candidate) {
        results.push({
          kind: "error",
          url,
          error: insErr?.message?.slice(0, 200) ?? "Insert falló",
        });
        continue;
      }
      const candId = candidate.id as string;
      const candName = candidate.full_name as string;

      if (firstStageId) {
        await attachIfMissing(db, {
          candidateId: candId,
          jobId: input.attachToJobId!,
          stageId: firstStageId,
          workspaceId,
        });
      }

      results.push({
        kind: "created",
        url,
        candidateId: candId,
        name: candName,
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

// Default pipeline stage import is just so we can reference its
// existence; the actual first stage lookup happens against the
// per-job pipeline_stages table.
void DEFAULT_PIPELINE_STAGES;

type DfB2BExperienceEntry = {
  company?: { id?: string; name?: string; url?: string };
  title?: string;
};

/**
 * Walk the candidate's experiences, upsert each unique company into
 * hiring.companies (dedup-first), and return a new ParsedProfile
 * with company_id populated on each matching experience entry.
 *
 * The cache is shared across the whole import batch so we never
 * call /enrich/company twice for the same company within one run.
 */
async function attachCompanyIds(
  parsed: ParsedProfile,
  rawExperience: DfB2BExperienceEntry[],
  workspaceId: string,
  cache: CompanyUpsertCache,
): Promise<ParsedProfile> {
  // Build hints keyed by normalized company name so we can map each
  // parsed.experience entry back to the upsert result.
  const hintsByName = new Map<string, { id?: string; url?: string }>();
  for (const e of rawExperience) {
    const name = e.company?.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (hintsByName.has(key)) continue;
    hintsByName.set(key, {
      id: e.company?.id,
      url: e.company?.url,
    });
  }

  const next = { ...parsed, experience: [...parsed.experience] };

  for (let i = 0; i < next.experience.length; i++) {
    const exp = next.experience[i];
    const name = exp.company?.trim();
    if (!name) continue;
    const hint = hintsByName.get(name.toLowerCase()) ?? {};
    try {
      const res = await upsertCompanyFromHint(
        workspaceId,
        {
          name,
          dfb2bId: hint.id,
          linkedinUrl: hint.url,
        },
        cache,
      );
      if (!res.skipped && res.companyId) {
        next.experience[i] = { ...exp, company_id: res.companyId };
      }
    } catch {
      // Company enrichment is best-effort. If it blows up, the
      // candidate still gets created without a company_id on this
      // entry — chip falls back to plain text.
    }
  }

  return next;
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
