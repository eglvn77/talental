"use server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

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

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const agencyName = String(formData.get("agency_name") ?? "").trim();

  if (!fullName) return { ok: false, error: "Tu nombre es obligatorio" };
  if (!email || !/.+@.+\..+/.test(email)) {
    return { ok: false, error: "Email inválido" };
  }
  if (!agencyName) return { ok: false, error: "El nombre de la agencia es obligatorio" };

  // SERVICE ROLE: signup — no user session exists yet.
  const admin = getSupabaseAdmin();
  const db = admin.schema("hiring");

  // 1. Reject if an active team_member already exists for this email.
  const { data: existingMember } = await db
    .from("team_members")
    .select("id")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();
  if (existingMember) {
    return {
      ok: false,
      error: "Ya existe una cuenta con este correo. Intenta iniciar sesión.",
    };
  }

  // 2. Find a free slug (deduplicate with -2, -3, ...).
  const baseSlug = slugify(agencyName);
  if (!baseSlug) {
    return {
      ok: false,
      error: "No pudimos crear tu agencia. Intenta con otro nombre.",
    };
  }
  let slug = baseSlug;
  let attempt = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: existing } = await db
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    attempt += 1;
    if (attempt > 100) {
      return {
        ok: false,
        error: "No pudimos crear tu agencia. Intenta con otro nombre.",
      };
    }
    slug = `${baseSlug}-${attempt}`;
  }

  // 3. Create the auth user (no password — magic-link only for now).
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { full_name: fullName, source: "signup" },
  });
  if (authErr || !created.user) {
    const msg = authErr?.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered")) {
      return {
        ok: false,
        error: "Ya existe una cuenta con este correo. Intenta iniciar sesión.",
      };
    }
    return {
      ok: false,
      error: authErr?.message?.slice(0, 200) || "No pudimos crear tu cuenta",
    };
  }
  const authUserId = created.user.id;

  // 4. Create the workspace.
  // SERVICE ROLE: signup — bypassing RLS to create the tenant.
  const { data: workspace, error: wsErr } = await db
    .from("workspaces")
    .insert({
      slug,
      name: agencyName,
      plan_tier: "trial",
      trial_ends_at: null,
      billing_email: email,
    })
    .select("id")
    .single();
  if (wsErr || !workspace) {
    // Roll back the auth user so they can retry cleanly.
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      error: wsErr?.message?.slice(0, 200) || "No pudimos crear el workspace",
    };
  }
  const workspaceId = workspace.id as string;

  // 5. Create the team_member (owner).
  // SERVICE ROLE: signup — RLS policy requires existing membership.
  const { error: memberErr } = await db.from("team_members").insert({
    workspace_id: workspaceId,
    auth_user_id: authUserId,
    email,
    full_name: fullName,
    team_role: "owner",
    is_active: true,
  });
  if (memberErr) {
    // Best-effort rollback.
    try {
      await db.from("workspaces").delete().eq("id", workspaceId);
    } catch {
      /* best-effort */
    }
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      error: memberErr.message?.slice(0, 200) || "No pudimos crear la membresía",
    };
  }

  // 6. Seed the 20 default rejection reasons.
  // SERVICE ROLE: signup — workspace-scoped templates.
  await db.from("rejection_reasons").insert(
    REJECTION_REASON_TEMPLATE.map((name, i) => ({
      workspace_id: workspaceId,
      name,
      position: (i + 1) * 10,
      is_system: true,
      is_active: true,
    })),
  );

  // 7. Send the magic link so they can sign in.
  const { error: linkErr } = await admin.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
      shouldCreateUser: false,
    },
  });
  if (linkErr) {
    return {
      ok: true,
      message: `Tu cuenta está lista. Ve a iniciar sesión con ${email}.`,
    };
  }

  return {
    ok: true,
    message: `Te mandamos un magic link a ${email}. Revisa tu bandeja para entrar.`,
  };
}
