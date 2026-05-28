import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCandidate,
  getCompany,
} from "@/lib/sourcing/dataforb2b";

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
      const result = await getCompany(detected.normalized);
      return NextResponse.json(
        {
          ok: true,
          kind: "company" as const,
          id: result.data.id,
          name: result.data.name,
          domain: result.data.domain,
          linkedin_url: result.data.linkedin_url,
          cacheHit: result.cacheHit,
          creditsUsed: result.creditsUsed,
        },
        { headers },
      );
    }
    // candidate
    const result = await getCandidate({ linkedinUrl: detected.normalized });
    return NextResponse.json(
      {
        ok: true,
        kind: "candidate" as const,
        id: result.data.id,
        name: result.data.full_name,
        email: result.data.email,
        linkedin_url: result.data.linkedin_url,
        cacheHit: result.cacheHit,
        creditsUsed: result.creditsUsed,
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
