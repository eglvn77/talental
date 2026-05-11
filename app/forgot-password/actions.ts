"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}

const NEUTRAL_MESSAGE =
  "Si el email existe, recibirás un link para restablecer tu contraseña.";

export async function forgotPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    // Same neutral message — avoid revealing whether the email is valid.
    return { ok: true, message: NEUTRAL_MESSAGE };
  }

  const supabase = await createSupabaseServerClient();
  // Always return the neutral message regardless of whether the user exists,
  // to prevent email enumeration.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/reset-password`,
  });
  return { ok: true, message: NEUTRAL_MESSAGE };
}
