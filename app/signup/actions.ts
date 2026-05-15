"use server";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

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

const MIN_PASSWORD = 8;

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !/.+@.+\..+/.test(email)) {
    return { ok: false, error: "Email inválido" };
  }
  if (password.length < MIN_PASSWORD) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
    };
  }

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

  // 2. Derive a slug from the email (e.g. emanuelgr7@gmail.com →
  //    emanuelgr7-gmail-com) with numeric dedupe on collision. The real
  //    team name comes later in /onboarding.
  const baseSlug = slugify(email);
  if (!baseSlug) {
    return {
      ok: false,
      error: "No pudimos crear tu cuenta. Intenta con otro correo.",
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
        error: "No pudimos crear tu cuenta. Intenta con otro correo.",
      };
    }
    slug = `${baseSlug}-${attempt}`;
  }

  // 3. Create the auth user with password, unconfirmed.
  // SERVICE ROLE: signup — user has no session yet.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { source: "signup" },
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
      // Placeholder; user picks the real team name in /onboarding.
      name: "Mi equipo",
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
    // Real name comes later in /onboarding.
    full_name: null,
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

  // 7. Send the email verification. We use auth.resend from a fresh anon
  // client (NOT the admin/service-role client) because admin.generateLink
  // only RETURNS the link without triggering email delivery, while resend
  // routes through Supabase's email service. The user was created by
  // admin.createUser above with email_confirm:false, so resend(type:signup)
  // is the right pairing.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: resendErr } = await anon.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (resendErr) {
    return {
      ok: true,
      message: `Tu cuenta está lista, pero el envío del email de confirmación falló (${resendErr.message.slice(0, 100)}). Pídelo de nuevo desde el login o contáctanos.`,
    };
  }

  return {
    ok: true,
    message: `Te enviamos un email a ${email} para confirmar tu cuenta. Revisa tu inbox y clickea el link.`,
  };
}
