import { NextResponse, after } from "next/server";
import { customAlphabet } from "nanoid";
import { isAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { tryRefreshJobCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

const slugAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const newSlug = customAlphabet(slugAlphabet, 12);

type Body = {
  manatal_job_id?: number;
  manatal_job_position_name?: string | null;
  manatal_organization_name?: string | null;
  client_display_name?: string;
  expires_at?: string | null;
};

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.manatal_job_id || !Number.isFinite(body.manatal_job_id)) {
    return NextResponse.json({ error: "manatal_job_id required" }, { status: 400 });
  }
  if (!body.client_display_name || !body.client_display_name.trim()) {
    return NextResponse.json(
      { error: "client_display_name required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const slug = newSlug();

  const { data, error } = await supabase
    .from("portal_links")
    .insert({
      slug,
      manatal_job_id: body.manatal_job_id,
      manatal_job_position_name: body.manatal_job_position_name ?? null,
      manatal_organization_name: body.manatal_organization_name ?? null,
      client_display_name: body.client_display_name.trim(),
      expires_at: body.expires_at || null,
    })
    .select("slug")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create" },
      { status: 500 },
    );
  }

  // Pre-warm the cache after the response is flushed. On Vercel this uses
  // waitUntil() so the lambda stays alive until the refresh completes; in
  // dev the Node process keeps it alive naturally. The advisory lock in
  // refreshJobCache() handles the case where another portal already triggered
  // a refresh for the same job (or cron is running).
  const jobId = body.manatal_job_id;
  after(async () => {
    try {
      // Lock-aware: if another path (cron, on-demand) is already refreshing
      // this job, this is a no-op. Existing portal pointing at the same job?
      // The cache already has fresh data; no need to fire again.
      await tryRefreshJobCache(jobId);
    } catch (err) {
      console.error(
        `[portal-links] background pre-warm failed for job ${jobId}:`,
        err,
      );
    }
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://clients.talental.mx";
  return NextResponse.json({
    slug: data.slug,
    url: `${siteUrl}/p/${data.slug}`,
  });
}
