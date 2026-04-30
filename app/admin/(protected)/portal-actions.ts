"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { tryRefreshJobCache } from "@/lib/cache";

// Bypasses the 15-min TTL skip — used by the "Refresh now" button so Emanuel
// can force a fresh pull right before showing a portal to a VIP client. If
// another worker (cron, auto-warm) is already refreshing the same job, we
// return their work-in-progress's eventual freshness rather than firing a
// duplicate.
export async function refreshPortalAction(
  manatalJobId: number,
): Promise<{ ok: true; lastSyncedAt: string } | { ok: false; error: string }> {
  if (!(await isAdmin())) {
    return { ok: false, error: "Unauthorized" };
  }
  if (!Number.isFinite(manatalJobId)) {
    return { ok: false, error: "Invalid job id" };
  }
  try {
    const result = await tryRefreshJobCache(manatalJobId);
    if (result === "contended") {
      // Another refresh is in flight; report the current freshest timestamp.
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("candidate_cache")
        .select("last_synced_at")
        .eq("manatal_job_id", manatalJobId)
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      revalidatePath("/admin");
      return {
        ok: true,
        lastSyncedAt:
          (data?.last_synced_at as string | undefined) ??
          new Date().toISOString(),
      };
    }
    const newest = result.reduce<number>((acc, r) => {
      const t = new Date(r.last_synced_at).getTime();
      return t > acc ? t : acc;
    }, 0);
    revalidatePath("/admin");
    return {
      ok: true,
      lastSyncedAt: new Date(newest || Date.now()).toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    return { ok: false, error: message.slice(0, 300) };
  }
}
