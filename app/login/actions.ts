"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}

export async function sendMagicLinkAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return { ok: false, error: "Email inválido" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
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
  // Successful sign-in writes cookies via the server client. Redirect.
  redirect("/jobs");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
