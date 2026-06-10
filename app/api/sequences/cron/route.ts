/**
 * Sequence runner cron — Vercel triggers every 5 minutes (vercel.json).
 * Auth: Authorization: Bearer <CRON_SECRET>, same gate as agents/cron.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processDueQueue } from "@/lib/sequences/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorize(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const stats = await processDueQueue();
    return NextResponse.json({ ok: true, duration_ms: Date.now() - t0, ...stats });
  } catch (e) {
    console.error("[sequences cron] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
