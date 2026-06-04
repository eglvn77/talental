import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PortalTokenRow } from "@/lib/hiring";

/**
 * Resolve a portal slug → token row. Returns null if slug doesn't exist,
 * is revoked, or is inactive. Cached per-request.
 */
export const resolvePortalToken = cache(
  async (slug: string): Promise<PortalTokenRow | null> => {
    const sb = getSupabaseAdmin();
    const { data } = await sb
      .schema("hiring")
      .from("portal_tokens")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .is("revoked_at", null)
      .maybeSingle();
    return (data as PortalTokenRow | null) ?? null;
  },
);
