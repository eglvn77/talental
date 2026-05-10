/**
 * One-shot bootstrap: ensures the BOOTSTRAP_EMAIL user exists in Supabase Auth
 * and is linked to a `hiring.team_members` row owning the Talental workspace.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-emanuel.ts
 *
 * Required env (from .env.local — load with `--env-file=.env.local`):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   BOOTSTRAP_EMAIL
 *
 * Idempotent — re-running on an existing user just generates a fresh magic
 * link.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const fullName = (process.env.BOOTSTRAP_NAME ?? "Emanuel").trim();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000";
  if (!url || !serviceKey || !email) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BOOTSTRAP_EMAIL",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Resolve the Talental workspace.
  const { data: ws, error: wsErr } = await admin
    .schema("hiring")
    .from("workspaces")
    .select("id, name")
    .eq("slug", "talental")
    .maybeSingle();
  if (wsErr || !ws) {
    throw new Error(
      "Talental workspace not found — run the multi-tenancy migration first",
    );
  }
  console.log(`Workspace: ${ws.name} (${ws.id})`);

  // 2. Find or create the auth user.
  let authUserId: string | null = null;
  {
    // Page through admin.listUsers; this is cheap for low user counts.
    let page = 1;
    const perPage = 200;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw error;
      const found = data.users.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (found) {
        authUserId = found.id;
        break;
      }
      if (data.users.length < perPage) break;
      page += 1;
    }
  }

  if (!authUserId) {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName, source: "bootstrap" },
      });
    if (createErr || !created.user) {
      throw createErr ?? new Error("Failed to create user");
    }
    authUserId = created.user.id;
    console.log(`Created auth user: ${authUserId}`);
  } else {
    console.log(`Auth user exists: ${authUserId}`);
  }

  // 3. Find or create the team_member row in hiring.
  const { data: existingMember } = await admin
    .schema("hiring")
    .from("team_members")
    .select("id, workspace_id, team_role, is_active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!existingMember) {
    const { error: memberErr } = await admin
      .schema("hiring")
      .from("team_members")
      .insert({
        workspace_id: ws.id,
        auth_user_id: authUserId,
        email,
        full_name: fullName,
        team_role: "owner",
        is_active: true,
      });
    if (memberErr) throw memberErr;
    console.log(`Created team_member (owner of ${ws.name}).`);
  } else {
    if (existingMember.workspace_id !== ws.id) {
      throw new Error(
        `team_member exists but belongs to workspace ${existingMember.workspace_id}, not Talental`,
      );
    }
    if (!existingMember.is_active) {
      await admin
        .schema("hiring")
        .from("team_members")
        .update({ is_active: true })
        .eq("id", existingMember.id);
      console.log("Reactivated existing team_member.");
    } else {
      console.log("team_member already exists and active.");
    }
  }

  // 4. Generate a fresh magic link for first-time sign-in.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });
  if (linkErr) {
    console.warn("Could not generate magic link:", linkErr.message);
  } else {
    console.log("\n=== Magic link (single-use, paste in browser) ===");
    console.log(linkData.properties?.action_link ?? "(none)");
    console.log("=================================================\n");
  }
}

main().catch((err) => {
  console.error("bootstrap failed:", err);
  process.exit(1);
});
