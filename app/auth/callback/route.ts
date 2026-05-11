import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeNext } from "@/app/login/sanitize-next";

/**
 * Handles email-link callbacks for signup confirmation, magic links, and
 * password recovery. Supabase emits two URL shapes:
 *   1. PKCE flow:        ?code=<otp>                  → exchangeCodeForSession
 *   2. Token-hash flow:  ?token_hash=<hash>&type=...  → verifyOtp
 *
 * `auth.resend({ type: 'signup' })` produces the token-hash shape;
 * `resetPasswordForEmail` and `signInWithOtp` typically produce the PKCE
 * shape. The callback handles both, then applies the onboarding gate
 * (mirroring the proxy) before redirecting to ?next= (sanitized).
 */

// Whitelist of OTP types we accept on the token-hash path. Keep this
// explicit — passing arbitrary strings to verifyOtp could open weird paths.
const ALLOWED_OTP_TYPES = new Set([
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
  "email",
]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = sanitizeNext(url.searchParams.get("next"));

  if (!code && !tokenHash) {
    const failed = url.clone();
    failed.pathname = "/login";
    failed.search = "?error=missing_code";
    return NextResponse.redirect(failed);
  }

  const supabase = await createSupabaseServerClient();

  let exchangeError: { message: string } | null = null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchangeError = error ? { message: error.message } : null;
  } else if (tokenHash && type && ALLOWED_OTP_TYPES.has(type)) {
    // verifyOtp accepts a constrained set of literal types — cast after the
    // whitelist check.
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "magiclink" | "recovery" | "invite" | "email_change" | "email",
      token_hash: tokenHash,
    });
    exchangeError = error ? { message: error.message } : null;
  } else {
    exchangeError = { message: "Tipo de link no soportado" };
  }

  if (exchangeError) {
    const failed = url.clone();
    failed.pathname = "/login";
    failed.search = `?error=${encodeURIComponent(exchangeError.message.slice(0, 200))}`;
    return NextResponse.redirect(failed);
  }

  // Onboarding gate: mirror the proxy so users land on /onboarding when
  // their workspace hasn't completed setup. Avoid an extra redirect hop.
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
      const onboarding = url.clone();
      onboarding.pathname = "/onboarding";
      onboarding.search = "";
      return NextResponse.redirect(onboarding);
    }
  }

  const dest = url.clone();
  dest.pathname = next;
  dest.search = "";
  return NextResponse.redirect(dest);
}
