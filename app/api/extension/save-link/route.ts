import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findOrCreateCandidateFromLinkedin } from "@/lib/sourcing/coresignal";
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

  let body: { url?: unknown };
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
    });
    if (!result.ok) throw new Error(result.error);
    return NextResponse.json(
      {
        ok: true,
        kind: "candidate" as const,
        id: result.data.id,
        name: result.data.full_name,
        email: null,
        linkedin_url: detected.normalized,
        cacheHit: result.cacheHit,
        creditsUsed: result.cacheHit ? 0 : 2,
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
