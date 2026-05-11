import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const REJECTION_REASON_TEMPLATE: string[] = [
  "Client rejected",
  "Conflict of interest",
  "Counter offer accepted",
  "Cultural fit",
  "Failed assessment",
  "Failed background check",
  "Hired elsewhere",
  "Job stability",
  "Lacking relevant experience",
  "Language skills missing",
  "Location",
  "No show",
  "Offer rejected",
  "Overqualified",
  "Role closed/filled",
  "Silver medalist",
  "Spam",
  "Technical skills missing",
  "Unaffordable",
  "Unresponsive",
];

function slugifyEmail(email: string): string {
  return email
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Ensure the given auth user has a workspace + team_member. Idempotent —
 * if they already have an active membership, this is a no-op.
 *
 * Called from /auth/callback for users who arrived via Google OAuth and
 * don't have an existing workspace (the email+password signup flow already
 * provisions the workspace inside signupAction).
 *
 * SERVICE ROLE: workspace + team_member writes bypass RLS because the
 * user's session hasn't been used to mutate hiring.* yet.
 */
export async function provisionWorkspaceIfMissing(
  authUserId: string,
  email: string,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const db = admin.schema("hiring");

  // 1. Bail if the user already has an active team_member row.
  const { data: existing } = await db
    .from("team_members")
    .select("id")
    .eq("auth_user_id", authUserId)
    .eq("is_active", true)
    .maybeSingle();
  if (existing) return;

  // 2. Find a free slug derived from the email.
  const baseSlug = slugifyEmail(email) || "team";
  let slug = baseSlug;
  let attempt = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: collision } = await db
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!collision) break;
    attempt += 1;
    if (attempt > 100) {
      throw new Error("Could not generate workspace slug after 100 attempts");
    }
    slug = `${baseSlug}-${attempt}`;
  }

  // 3. Create workspace + team_member + rejection_reasons.
  const { data: workspace, error: wsErr } = await db
    .from("workspaces")
    .insert({
      slug,
      name: "Mi equipo",
      plan_tier: "trial",
      trial_ends_at: null,
      billing_email: email,
    })
    .select("id")
    .single();
  if (wsErr || !workspace) {
    throw new Error(
      `workspace insert failed: ${wsErr?.message ?? "unknown"}`,
    );
  }
  const workspaceId = workspace.id as string;

  const { error: memberErr } = await db.from("team_members").insert({
    workspace_id: workspaceId,
    auth_user_id: authUserId,
    email,
    full_name: null,
    team_role: "owner",
    is_active: true,
  });
  if (memberErr) {
    // Roll back the workspace so a retry can succeed.
    try {
      await db.from("workspaces").delete().eq("id", workspaceId);
    } catch {
      /* best-effort */
    }
    throw new Error(`team_member insert failed: ${memberErr.message}`);
  }

  await db.from("rejection_reasons").insert(
    REJECTION_REASON_TEMPLATE.map((name, i) => ({
      workspace_id: workspaceId,
      name,
      position: (i + 1) * 10,
      is_system: true,
      is_active: true,
    })),
  );
}
