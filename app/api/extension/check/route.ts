import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";

/**
 * Extension "does this LinkedIn profile already exist in our ATS?"
 * lookup. GET so the extension can fire it on page load without a
 * preflight.
 *
 * Query:  ?url=https://www.linkedin.com/in/<slug>
 * Returns:
 *   - { ok:true, exists:false }
 *   - { ok:true, exists:true, kind:"candidate", id, name, linkedin_url }
 *   - { ok:true, exists:true, kind:"company", id, name, linkedin_url }
 *
 * Dedup matches the same canonical form used when saving:
 * `https://linkedin.com/in/<lowercase-slug>`. Hosts (www., mx., etc.)
 * collapse; slug is lowercased.
 *
 * Auth: Supabase session cookies (same pattern as /save-link).
 */

const LINKEDIN_PROFILE_RE = /^\/in\/([^/?#]+)/i;
const LINKEDIN_COMPANY_RE = /^\/company\/([^/?#]+)/i;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin =
    origin && origin.startsWith("chrome-extension://") ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

function detectKindAndCanonical(rawUrl: string): {
  kind: "candidate" | "company";
  canonical: string;
} | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/(?:^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const profile = u.pathname.match(LINKEDIN_PROFILE_RE);
  if (profile) {
    return {
      kind: "candidate",
      canonical: `https://linkedin.com/in/${profile[1].toLowerCase()}`,
    };
  }
  const company = u.pathname.match(LINKEDIN_COMPANY_RE);
  if (company) {
    return {
      kind: "company",
      canonical: `https://linkedin.com/company/${company[1].toLowerCase()}`,
    };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sin sesión." },
      { status: 401, headers },
    );
  }

  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Falta `url` query param." },
      { status: 400, headers },
    );
  }

  const detected = detectKindAndCanonical(url);
  if (!detected) {
    return NextResponse.json(
      { ok: true, exists: false },
      { headers },
    );
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  if (detected.kind === "candidate") {
    const { data } = await db
      .from("candidates")
      .select("id, full_name, linkedin_url")
      .eq("workspace_id", workspaceId)
      .eq("linkedin_url", detected.canonical)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ ok: true, exists: false }, { headers });
    }
    return NextResponse.json(
      {
        ok: true,
        exists: true,
        kind: "candidate" as const,
        id: data.id,
        name: data.full_name,
        linkedin_url: data.linkedin_url,
      },
      { headers },
    );
  }

  // company
  const { data } = await db
    .from("companies")
    .select("id, name, linkedin_url")
    .eq("workspace_id", workspaceId)
    .eq("linkedin_url", detected.canonical)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ ok: true, exists: false }, { headers });
  }
  return NextResponse.json(
    {
      ok: true,
      exists: true,
      kind: "company" as const,
      id: data.id,
      name: data.name,
      linkedin_url: data.linkedin_url,
    },
    { headers },
  );
}
