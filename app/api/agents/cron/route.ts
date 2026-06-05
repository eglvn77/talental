import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { CronExpressionParser } from "cron-parser";
import { hiring } from "@/lib/hiring/clients";
import { runAgent } from "@/lib/agents/run";

/**
 * Polling cron for in-app agents. Vercel triggers this every 5
 * minutes; we scan every active in_app agent that has a
 * `schedule_cron`, evaluate whether the cron should have fired
 * within the last 5-minute window, and trigger a run for each
 * match.
 *
 * Idempotency: lookback window matches the Vercel cron cadence, so
 * even if a single execution drifts by a minute or two we don't
 * double-fire (because the previous tick's `prevTime` is just
 * outside the new tick's window). We DON'T persist a last-run
 * marker per-agent — the `agent_runs` table is the source of
 * truth, and the source field distinguishes 'cron' triggers from
 * manual/Slack ones for the dashboard split.
 *
 * Auth: CRON_SECRET header (same as the portal cron). Vercel
 * injects this on its own cron invocations; external callers must
 * supply `Authorization: Bearer <secret>`.
 */

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CRON_TICK_SECONDS = 5 * 60; // matches our Vercel cron schedule

type Summary = {
  total_checked: number;
  triggered: Array<{ id: string; name: string; runId: string }>;
  skipped: Array<{ id: string; name: string; reason: string }>;
  errors: Array<{ id: string; name: string; error: string }>;
  duration_ms: number;
};

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();

  const db = await hiring();
  const { data: agents, error } = await db
    .from("agents")
    .select("id, name, schedule_cron, status, runtime")
    .eq("status", "active")
    .eq("runtime", "in_app")
    .not("schedule_cron", "is", null);
  if (error) {
    return NextResponse.json(
      { error: `Failed to load agents: ${error.message}` },
      { status: 500 },
    );
  }

  const summary: Summary = {
    total_checked: (agents ?? []).length,
    triggered: [],
    skipped: [],
    errors: [],
    duration_ms: 0,
  };

  const now = new Date();
  const windowStart = new Date(now.getTime() - CRON_TICK_SECONDS * 1000);

  for (const a of agents ?? []) {
    const cron = a.schedule_cron as string;
    let shouldFire = false;
    try {
      // `CronExpressionParser.parse` returns an iterator we can
      // walk backwards from now. If the previous fire time falls
      // inside our 5-minute window, fire it.
      const parsed = CronExpressionParser.parse(cron, { currentDate: now });
      const prev = parsed.prev().toDate();
      shouldFire = prev > windowStart && prev <= now;
    } catch (e) {
      summary.errors.push({
        id: a.id as string,
        name: (a.name as string) ?? "",
        error: `bad cron: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    if (!shouldFire) {
      summary.skipped.push({
        id: a.id as string,
        name: (a.name as string) ?? "",
        reason: "not_in_window",
      });
      continue;
    }

    try {
      // Run each agent sequentially. Vercel function timeout is
      // 300s, and a single agent typically takes <30s; the cockpit
      // has 1 active agent today so parallelism isn't worth the
      // added failure modes (rate limits, partial failures, etc.).
      const result = await runAgent(a.id as string, { source: "cron" });
      if (result.status === "ok") {
        summary.triggered.push({
          id: a.id as string,
          name: (a.name as string) ?? "",
          runId: result.runId,
        });
      } else {
        summary.errors.push({
          id: a.id as string,
          name: (a.name as string) ?? "",
          error: result.error ?? "unknown",
        });
      }
    } catch (e) {
      summary.errors.push({
        id: a.id as string,
        name: (a.name as string) ?? "",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  summary.duration_ms = Date.now() - t0;
  return NextResponse.json(summary);
}

function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) return false;
  const provided = match[1];
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
