import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hiring, type TeamMemberRow, type WorkspaceRow } from "@/lib/hiring";

export type SupabaseSessionUser = {
  id: string;
  email: string | null;
};

export type CurrentUser = {
  id: string; // auth.users.id
  email: string;
  team_member: TeamMemberRow;
  workspace: WorkspaceRow;
};

/** Returns the Supabase auth user for the current request, or null. */
export const getSession = cache(
  async (): Promise<SupabaseSessionUser | null> => {
    const supabase = await createSupabaseServerClient();
    // `getUser()` validates the JWT against Supabase rather than trusting the
    // cookie blindly — this is the recommended SSR pattern.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
);

/** Throws to /admin/login if there's no session. */
export async function requireSession(): Promise<SupabaseSessionUser> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}

/**
 * Loads the team_member + workspace for the current authenticated user.
 * Returns null if no session, or if the user has no team_member row yet
 * (orphan auth user — should not happen in steady state).
 *
 * Uses the service-role admin client because RLS is not yet wired for
 * authenticated users (Phase 1.b will add it). The auth.uid() check is
 * still done first via the auth-aware client.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const admin = getSupabaseAdmin().schema("hiring");
  const { data: member, error: memberErr } = await admin
    .from("team_members")
    .select("*")
    .eq("auth_user_id", session.id)
    .eq("is_active", true)
    .maybeSingle();
  if (memberErr || !member) return null;

  const teamMember = member as TeamMemberRow;
  const { data: workspace, error: wsErr } = await admin
    .from("workspaces")
    .select("*")
    .eq("id", teamMember.workspace_id)
    .maybeSingle();
  if (wsErr || !workspace) return null;

  return {
    id: session.id,
    email: session.email ?? teamMember.email,
    team_member: teamMember,
    workspace: workspace as WorkspaceRow,
  };
});

/** Convenience: true iff the request has a valid Supabase session. */
export async function isAuthenticated(): Promise<boolean> {
  return Boolean(await getSession());
}

/** Best-effort sign-out for use in server actions. */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

// Re-export for callers that want to centralise the import:
export { hiring };
