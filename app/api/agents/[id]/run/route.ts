import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { runAgent } from "@/lib/agents/run";

/**
 * POST /api/agents/[id]/run
 *
 * Triggers a single in-app agent run. Auth: admin session (same
 * gate as the rest of the cockpit). Body is optional — if absent,
 * the runner treats it as a scheduled-style run. When called from
 * Slack / cron the request body carries the trigger context.
 *
 * Returns the agent_run id so the UI can poll or refresh.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: { message?: string; source?: "manual" | "api" } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Empty / invalid body — fine, defaults apply.
  }

  try {
    const result = await runAgent(id, {
      message: body.message,
      source: body.source ?? "manual",
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message.slice(0, 500) : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Vercel function timeout — the runner can take 30-60s for big
 * prompts; default 300s is fine but we set explicitly so the agent
 * cron isn't surprised when this changes upstream.
 */
export const maxDuration = 120;
