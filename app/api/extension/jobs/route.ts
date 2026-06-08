import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";

/**
 * Active jobs for the extension's "Asociar a vacante" dropdown.
 * Returns only OPEN jobs (status.is_open = true), most recent first,
 * capped at 50. The recruiter rarely tracks more than that actively;
 * if they need an older one, they can save the candidate first and
 * attach the job from the in-app slideover.
 *
 * Returns shape:
 *   { ok: true, jobs: [{ id, title, company_name|null }, ...] }
 *
 * Auth: Supabase session cookies (same as the other /api/extension/*).
 */

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

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Pre-resolve open statuses so we can filter without a join.
  const { data: openStatuses } = await db
    .from("job_statuses")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_open", true);
  const openStatusIds = (openStatuses ?? []).map(
    (s) => (s as { id: string }).id,
  );

  let query = db
    .from("jobs")
    .select("id, title, company:companies(name)")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (openStatusIds.length > 0) {
    query = query.in("status_id", openStatusIds);
  }
  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers },
    );
  }

  type Row = {
    id: string;
    title: string;
    company:
      | { name: string }
      | Array<{ name: string }>
      | null;
  };
  const jobs = ((data ?? []) as Row[]).map((j) => {
    const c = j.company;
    const companyName = c
      ? Array.isArray(c)
        ? (c[0]?.name ?? null)
        : c.name
      : null;
    return {
      id: j.id,
      title: j.title,
      company_name: companyName,
    };
  });

  return NextResponse.json({ ok: true, jobs }, { headers });
}
