"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAuthenticated as isAdmin } from "@/lib/auth/session";
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
      revalidatePath("/admin/portals");
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
    revalidatePath("/admin/portals");
    return {
      ok: true,
      lastSyncedAt: new Date(newest || Date.now()).toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    return { ok: false, error: message.slice(0, 300) };
  }
}

export async function togglePortalActiveAction(
  portalId: string,
  newState: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!(await isAdmin())) {
    return { success: false, error: "Unauthorized" };
  }
  if (typeof portalId !== "string" || portalId.length === 0) {
    return { success: false, error: "Invalid portal id" };
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("portal_links")
    .update({ is_active: newState })
    .eq("id", portalId);
  if (error) {
    return { success: false, error: error.message.slice(0, 300) };
  }
  revalidatePath("/admin/portals");
  return { success: true };
}

export async function deletePortalLinkAction(
  portalId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!(await isAdmin())) {
    return { success: false, error: "Unauthorized" };
  }
  if (typeof portalId !== "string" || portalId.length === 0) {
    return { success: false, error: "Invalid portal id" };
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("portal_links")
    .delete()
    .eq("id", portalId);
  if (error) {
    return { success: false, error: error.message.slice(0, 300) };
  }
  revalidatePath("/admin/portals");
  return { success: true };
}
