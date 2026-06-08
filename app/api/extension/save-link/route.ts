import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  findOrCreateCandidateFromLinkedin,
  type ScrapedLinkedinFallback,
} from "@/lib/sourcing/coresignal";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";

/**
 * Save-from-extension endpoint. POSTed from the Chrome extension when
 * the user clicks "Save to Talental" on a LinkedIn page.
 *
 * Body:  { url: string }
 *
 * Behaviour:
 *   - Parse the URL → detect candidate (`/in/<slug>`) or company
 *     (`/company/<slug>`).
 *   - Dispatch to the existing cache-first wrapper (getCandidate /
 *     getCompany) so the same dedup + enrichment-via-DfB2B path the
 *     in-app flows use is honored. If the row already exists, returns
 *     it without re-spending credits.
 *
 * Auth: relies on the Supabase session cookie. The extension declares
 * host_permissions for the API host, so the browser sends the user's
 * existing cookies as if from a first-party request — no separate
 * token plumbing needed in the MVP.
 *
 * CORS: we explicitly allow chrome-extension:// origins. Same-origin
 * (the web app itself calling it) is also fine.
 */

const LINKEDIN_PROFILE_RE = /^\/in\/([^/?#]+)/i;
const LINKEDIN_COMPANY_RE = /^\/company\/([^/?#]+)/i;

function corsHeaders(origin: string | null): Record<string, string> {
  // Allow any chrome-extension:// origin. Production deployments
  // could narrow this to a known extension id once we publish, but
  // during dev the id rotates.
  const allowOrigin =
    origin && origin.startsWith("chrome-extension://") ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

type SaveKind = "candidate" | "company";

function detectKind(rawUrl: string): {
  kind: SaveKind;
  normalized: string;
} | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  // Accept linkedin.com + any subdomain (mx., www., etc).
  if (!/(?:^|\.)linkedin\.com$/i.test(u.hostname)) return null;

  const profile = u.pathname.match(LINKEDIN_PROFILE_RE);
  if (profile) {
    return {
      kind: "candidate",
      normalized: `https://linkedin.com/in/${profile[1].toLowerCase()}`,
    };
  }
  const company = u.pathname.match(LINKEDIN_COMPANY_RE);
  if (company) {
    return {
      kind: "company",
      normalized: `https://linkedin.com/company/${company[1].toLowerCase()}`,
    };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));

  // Auth gate — extension piggybacks on the user's existing Supabase
  // session via cookies (host_permissions in manifest).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sin sesión. Inicia sesión en el ATS primero." },
      { status: 401, headers },
    );
  }

  let body: {
    url?: unknown;
    scraped_data?: unknown;
    job_id?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400, headers },
    );
  }

  const url = typeof body.url === "string" ? body.url : "";
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Falta el parámetro `url`." },
      { status: 400, headers },
    );
  }
  const jobId = typeof body.job_id === "string" ? body.job_id : null;
  let scrapedFallback = parseScrapedFallback(body.scraped_data);

  const detected = detectKind(url);
  if (!detected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "URL no soportado. Abre una página de LinkedIn (/in/… o /company/…).",
      },
      { status: 400, headers },
    );
  }

  // Defensive: every extension call MUST go through the scraped-data
  // path, never Coresignal. If the page scrape failed (content
  // script not loaded, DOM not ready, etc.) we still synthesize a
  // minimal scrapedFallback from the URL slug so the sourcing helper
  // takes the scraped branch instead of falling through to a
  // Coresignal lookup that 404s for any non-indexed profile.
  if (!scrapedFallback && detected.kind === "candidate") {
    const slug = detected.normalized.match(/\/in\/([^/?#]+)/i)?.[1] ?? "";
    const placeholder = slug
      ? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Unknown";
    scrapedFallback = { full_name: placeholder };
  }

  try {
    if (detected.kind === "company") {
      // Company side of the extension: dedup on linkedin_url; create a
      // bare row with the slug as the placeholder name (the recruiter
      // can re-name on first edit). Domain-based Coresignal enrichment
      // is a separate explicit click on the company slideover — we
      // don't burn credits at save-from-extension time.
      const workspaceId = await getRequestWorkspaceId();
      const db = await hiring();
      const slug = detected.normalized.match(/\/company\/([^/?#]+)/i)?.[1];
      const name = slug
        ? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "Unknown";
      const { data: existing } = await db
        .from("companies")
        .select("id, name, domain, linkedin_url")
        .eq("workspace_id", workspaceId)
        .eq("linkedin_url", detected.normalized)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          {
            ok: true,
            kind: "company" as const,
            id: existing.id,
            name: existing.name,
            domain: existing.domain,
            linkedin_url: existing.linkedin_url,
            cacheHit: true,
            creditsUsed: 0,
          },
          { headers },
        );
      }
      const { data: created, error } = await db
        .from("companies")
        .insert({
          workspace_id: workspaceId,
          name,
          linkedin_url: detected.normalized,
        })
        .select("id, name, domain, linkedin_url")
        .single();
      if (error || !created) throw new Error(error?.message ?? "insert failed");
      return NextResponse.json(
        {
          ok: true,
          kind: "company" as const,
          id: created.id,
          name: created.name,
          domain: created.domain,
          linkedin_url: created.linkedin_url,
          cacheHit: false,
          creditsUsed: 0,
        },
        { headers },
      );
    }
    // candidate
    const result = await findOrCreateCandidateFromLinkedin({
      linkedinUrl: detected.normalized,
      scrapedFallback,
    });
    if (!result.ok) throw new Error(result.error);

    // Optional: attach to a job. Fail-soft — if the job lookup fails
    // we still return the candidate (the recruiter can attach via UI).
    let attachedApplicationId: string | null = null;
    if (jobId) {
      try {
        attachedApplicationId = await attachCandidateToJob(
          result.data.id,
          jobId,
        );
      } catch (e) {
        // Log only; don't break the save.
        console.error("[ext] attach to job failed:", e);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        kind: "candidate" as const,
        id: result.data.id,
        name: result.data.full_name,
        email: null,
        linkedin_url: detected.normalized,
        cacheHit: result.cacheHit,
        creditsUsed:
          result.cacheHit || result.enrichmentSource === "scraped_fallback"
            ? 0
            : 2,
        enrichment_source: result.enrichmentSource,
        application_id: attachedApplicationId,
        job_id: attachedApplicationId ? jobId : null,
      },
      { headers },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg.slice(0, 300) },
      { status: 500, headers },
    );
  }
}

/**
 * Tolerant parsing of the extension's scraped payload. Accepts any
 * shape and pulls only the known string fields. Trims + null-empties
 * so the downstream sourcing helper doesn't have to.
 */
function parseScrapedFallback(raw: unknown): ScrapedLinkedinFallback | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const pick = (k: string): string | null => {
    const v = obj[k];
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    return trimmed ? trimmed : null;
  };
  const result: ScrapedLinkedinFallback = {
    full_name: pick("full_name"),
    headline: pick("headline"),
    current_title: pick("current_title"),
    current_company: pick("current_company"),
    location: pick("location"),
    about: pick("about"),
  };
  // If everything is null, skip entirely.
  if (Object.values(result).every((v) => !v)) return null;
  return result;
}

/**
 * Create an application for (candidateId, jobId) at the job's first
 * pipeline stage. Idempotent — returns the existing application_id
 * when (candidate, job) already linked.
 */
async function attachCandidateToJob(
  candidateId: string,
  jobId: string,
): Promise<string | null> {
  const db = await hiring();
  const workspaceId = await getRequestWorkspaceId();

  // Already attached?
  const { data: existing } = await db
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  // Need the job's first stage for the new application.
  const { data: stages } = await db
    .from("pipeline_stages")
    .select("id, position")
    .eq("job_id", jobId)
    .order("position", { ascending: true })
    .limit(1);
  const firstStage = (stages ?? [])[0] as { id: string } | undefined;
  if (!firstStage) {
    throw new Error("Job has no pipeline stages configured");
  }

  const { data: inserted, error } = await db
    .from("applications")
    .insert({
      workspace_id: workspaceId,
      candidate_id: candidateId,
      job_id: jobId,
      stage_id: firstStage.id,
      source: "linkedin",
      source_meta: { from: "chrome_extension" },
    })
    .select("id")
    .single();
  if (error || !inserted) {
    throw new Error(`Couldn't create application: ${error?.message}`);
  }
  return (inserted as { id: string }).id;
}
