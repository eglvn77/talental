"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { sanitizeNext, DEFAULT_NEXT } from "./sanitize-next";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function sendMagicLinkAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = sanitizeNext(String(formData.get("next") ?? ""));
  if (!email || !/.+@.+\..+/.test(email)) {
    return { ok: false, error: "Email inválido" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Forward `next` through the callback so the user lands where they
      // were headed. The proxy still applies the onboarding gate after.
      emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: false,
    },
  });
  if (error) {
    return { ok: false, error: error.message.slice(0, 300) };
  }
  return {
    ok: true,
    message: `Te mandamos un magic link a ${email}. Revisa tu bandeja.`,
  };
}

export async function passwordSignInAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNext(String(formData.get("next") ?? ""));
  if (!email || !password) {
    return { ok: false, error: "Email y contraseña requeridos" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
      return {
        ok: false,
        error: "Confirma tu email antes de iniciar sesión. Revisa tu inbox.",
      };
    }
    if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
      return { ok: false, error: "Email o contraseña incorrectos." };
    }
    return { ok: false, error: error.message.slice(0, 300) };
  }

  // Onboarding gate: if the workspace hasn't completed onboarding, ignore
  // `next` and send the user there. (The proxy enforces the same rule on
  // the next request — we do it here too to avoid an extra redirect hop.)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: member } = await supabase
      .schema("hiring")
      .from("team_members")
      .select("workspace:workspaces(onboarding_completed_at)")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    const workspace = member?.workspace as
      | { onboarding_completed_at: string | null }
      | { onboarding_completed_at: string | null }[]
      | null
      | undefined;
    const workspaceRow = Array.isArray(workspace) ? workspace[0] : workspace;
    if (!workspaceRow?.onboarding_completed_at) {
      redirect("/onboarding");
    }
  }

  redirect(next || DEFAULT_NEXT);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
