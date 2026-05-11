"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

const MIN_PASSWORD = 8;

export async function resetPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_PASSWORD) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
    };
  }
  if (password !== confirm) {
    return { ok: false, error: "Las contraseñas no coinciden." };
  }

  const supabase = await createSupabaseServerClient();
  // The user arrived here with a recovery session already exchanged by
  // /auth/callback (or by Supabase's automatic session detection from the
  // link's hash). updateUser requires that session to be present.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return {
      ok: false,
      error: "El link de recuperación expiró. Solicita uno nuevo.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, error: error.message.slice(0, 300) };
  }
  // Sign out so they have to log in with the new password.
  await supabase.auth.signOut();
  redirect("/login?reset=ok");
}
