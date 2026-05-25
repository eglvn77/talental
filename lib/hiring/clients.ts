// Hard fence: this module pulls in next/headers via supabase/server, so
// any accidental import from a Client Component (e.g. via the
// @/lib/hiring barrel) should error here at dev time with a readable
// message instead of breaking the Turbopack build cryptically.
import "server-only";

// =====================================================
// Schema-scoped Supabase clients and workspace context.
//
// `hiring()` is the default — auth-aware (cookie session) so RLS
// applies. Use this in pages and server actions.
//
// `hiringAdmin()` is service-role and bypasses RLS. Only use when
// you have an explicit reason (cross-workspace ops, scripts,
// pre-session lookups). Mark each call site with a comment.
//
// `getRequestWorkspaceId()` resolves the active workspace from the
// JWT custom claim (fast path) or a team_members lookup (fallback
// before the Custom Access Token Hook is enabled).
// =====================================================

import { type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../supabase/admin";
import { createSupabaseServerClient } from "../supabase/server";
import { readCustomClaims } from "../auth/jwt-claims";

export async function hiring(): Promise<ReturnType<SupabaseClient["schema"]>> {
  const supabase = await createSupabaseServerClient();
  return supabase.schema("hiring");
}

export function hiringAdmin(): ReturnType<SupabaseClient["schema"]> {
  return getSupabaseAdmin().schema("hiring");
}

export async function getRequestWorkspaceId(): Promise<string> {
  const supabase = await createSupabaseServerClient();

  // Fast path: read workspace_id from the JWT custom claim populated by
  // public.custom_access_token_hook — no DB round-trip.
  const { data: sessionData } = await supabase.auth.getSession();
  const claims = readCustomClaims(sessionData.session?.access_token);
  if (claims.workspace_id) return claims.workspace_id;

  // Slow fallback: hook not enabled yet, or session was issued before the
  // hook was wired up. Validate against Supabase and look up team_members.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Not authenticated");
  }
  const { data: member, error: memberErr } = await supabase
    .schema("hiring")
    .from("team_members")
    .select("workspace_id")
    .eq("auth_user_id", data.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (memberErr || !member) {
    throw new Error("User has no workspace");
  }
  return member.workspace_id as string;
}
