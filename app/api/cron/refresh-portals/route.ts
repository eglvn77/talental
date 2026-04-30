import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin, type PortalLinkRow } from "@/lib/supabase";
import { tryRefreshJobCache } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // seconds — Vercel Pro limit; we expect <15min wall

// Skip a portal if it was refreshed less than this many ms ago.
// Lines up with the on-demand TTL in lib/cache.ts so we don't double-refresh.
const SKIP_IF_FRESHER_THAN_MS = 15 * 60 * 1000;

type Summary = {
  total_portals: number;
  refreshed: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  details: Array<{
    job_id: number;
    slug: string;
    outcome: "refreshed" | "skipped" | "error";
    age_min?: number;
    error?: string;
  }>;
};

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = getSupabaseAdmin();

  const { data: links, error: linksErr } = await supabase
    .from("portal_links")
    .select("*")
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: true });

  if (linksErr) {
    return NextResponse.json(
      { error: `Failed to load portals: ${linksErr.message}` },
      { status: 500 },
    );
  }

  const portals = (links ?? []) as PortalLinkRow[];

  // De-dupe by manatal_job_id — multiple portals can point at the same job;
  // refreshing once covers all of them.
  const seenJobIds = new Set<number>();
  const uniquePortals: PortalLinkRow[] = [];
  for (const p of portals) {
    if (seenJobIds.has(p.manatal_job_id)) continue;
    seenJobIds.add(p.manatal_job_id);
    uniquePortals.push(p);
  }

  // Pre-load freshness for all involved jobs in one query so we don't N+1.
  const freshnessByJob = new Map<number, number>();
  if (uniquePortals.length > 0) {
    const { data: rows } = await supabase
      .from("candidate_cache")
      .select("manatal_job_id, last_synced_at")
      .in("manatal_job_id", uniquePortals.map((p) => p.manatal_job_id));
    for (const r of rows ?? []) {
      const ts = new Date(r.last_synced_at as string).getTime();
      const cur = freshnessByJob.get(r.manatal_job_id);
      if (!cur || ts > cur) freshnessByJob.set(r.manatal_job_id, ts);
    }
  }

  const summary: Summary = {
    total_portals: uniquePortals.length,
    refreshed: 0,
    skipped: 0,
    errors: 0,
    duration_ms: 0,
    details: [],
  };

  // Sequential. The token bucket in lib/manatal.ts is a global singleton, so
  // running concurrent portals doesn't increase throughput — it just reorders
  // the same total req count against the same global cap. Sequential is
  // simpler to reason about and produces clean per-portal log lines.
  for (const portal of uniquePortals) {
    const portalStartedAt = Date.now();
    const lastSynced = freshnessByJob.get(portal.manatal_job_id);
    const ageMs = lastSynced ? Date.now() - lastSynced : Number.POSITIVE_INFINITY;
    const ageMin = Math.round(ageMs / 60000);

    if (Number.isFinite(ageMs) && ageMs < SKIP_IF_FRESHER_THAN_MS) {
      summary.skipped += 1;
      summary.details.push({
        job_id: portal.manatal_job_id,
        slug: portal.slug,
        outcome: "skipped",
        age_min: ageMin,
      });
      await logCron(
        portal.manatal_job_id,
        Date.now() - portalStartedAt,
        200,
        `skipped (age ${ageMin}m, slug=${portal.slug})`,
      );
      continue;
    }

    try {
      const result = await tryRefreshJobCache(portal.manatal_job_id);
      if (result === "contended") {
        // Another worker (auto-warm, on-demand, or another scheduler) is
        // refreshing this job right now. Skip — they'll finish the work.
        summary.skipped += 1;
        summary.details.push({
          job_id: portal.manatal_job_id,
          slug: portal.slug,
          outcome: "skipped",
        });
        await logCron(
          portal.manatal_job_id,
          Date.now() - portalStartedAt,
          200,
          `skipped (contended, slug=${portal.slug})`,
        );
        continue;
      }
      summary.refreshed += 1;
      summary.details.push({
        job_id: portal.manatal_job_id,
        slug: portal.slug,
        outcome: "refreshed",
        age_min: Number.isFinite(ageMs) ? ageMin : undefined,
      });
      await logCron(
        portal.manatal_job_id,
        Date.now() - portalStartedAt,
        200,
        `refreshed (slug=${portal.slug})`,
      );
    } catch (err) {
      summary.errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      summary.details.push({
        job_id: portal.manatal_job_id,
        slug: portal.slug,
        outcome: "error",
        error: message.slice(0, 300),
      });
      await logCron(
        portal.manatal_job_id,
        Date.now() - portalStartedAt,
        500,
        `error refreshing job ${portal.manatal_job_id} (slug=${portal.slug}): ${message.slice(0, 400)}`,
      );
    }
  }

  summary.duration_ms = Date.now() - startedAt;
  return NextResponse.json(summary);
}

function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) return false;
  const provided = match[1];
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function logCron(
  jobId: number,
  durationMs: number,
  statusCode: number,
  message: string,
) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("sync_log").insert({
      manatal_job_id: jobId,
      endpoint: "cron-refresh",
      status_code: statusCode,
      duration_ms: durationMs,
      error_message: message,
    });
  } catch {
    // logging shouldn't break the sweep
  }
}
