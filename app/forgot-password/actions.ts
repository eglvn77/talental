"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

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
  // Route through /auth/callback so the PKCE code gets exchanged for a
  // session (the bare /reset-password page can't do that exchange and would
  // surface as "link expired"). The callback's ?next= param hands off to
  // the reset page after the exchange.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });
  return { ok: true, message: NEUTRAL_MESSAGE };
}
