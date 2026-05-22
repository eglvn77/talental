"use server";

import { regenerateApplicationContext } from "@/lib/ai/application-context";
import { ensureAdmin, type ActionResult } from "./_shared";
import type { NextStep } from "@/lib/ai/application-context";

/**
 * Regenerate the AI status line + next steps for one application.
 * Called from the candidate slideover refresh button and (in a future
 * pass) from a stage-change trigger.
 */
export async function regenerateApplicationContextAction(
  applicationId: string,
): Promise<ActionResult<{ status_line: string; next_steps: NextStep[] }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const res = await regenerateApplicationContext(applicationId);
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    data: {
      status_line: res.context.status_line,
      next_steps: res.context.next_steps,
    },
  };
}
