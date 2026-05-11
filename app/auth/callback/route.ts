import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeNext } from "@/app/login/sanitize-next";
import { provisionWorkspaceIfMissing } from "@/lib/auth/provision-workspace";

/**
 * Handles email-link callbacks. Supabase emits three URL shapes:
 *
 *   1. PKCE flow:        ?code=<otp>                  → exchangeCodeForSession
 *   2. Token-hash flow:  ?token_hash=<hash>&type=...  → verifyOtp
 *   3. Implicit flow:    #access_token=...&refresh_token=...&type=...
 *      (legacy /auth/v1/verify?token=... redirect path; tokens are in the
 *       URL hash fragment which the server can't see)
 *
 * Strategy:
 *   - GET with ?code        → exchangeCodeForSession server-side
 *   - GET with ?token_hash  → verifyOtp server-side
 *   - GET with neither      → return a tiny HTML page that reads the hash
 *                             client-side and POSTs the tokens back to
 *                             this same route, which then sets the session
 *                             via cookies
 *   - POST {access_token, refresh_token, next} → setSession + redirect
 *
 * All success paths apply sanitizeNext to ?next= and route through the
 * onboarding gate (mirrors proxy.ts).
 */

const ALLOWED_OTP_TYPES = new Set([
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
  "email",
]);

async function resolveDestination(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  next: string,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return next;

  // OAuth users land here with no pre-provisioned workspace. Idempotent —
  // bails immediately if they already have a team_member row.
  if (user.email) {
    try {
      await provisionWorkspaceIfMissing(user.id, user.email);
    } catch (e) {
      console.error("provisionWorkspaceIfMissing failed:", e);
      // Don't block the redirect; the proxy will catch the missing workspace
      // and the user will see an error on the next request.
    }
  }

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
  if (!workspaceRow?.onboarding_completed_at) return "/onboarding";
  return next;
}

function failureRedirect(request: NextRequest, message: string) {
  const failed = request.nextUrl.clone();
  failed.pathname = "/login";
  failed.search = `?error=${encodeURIComponent(message.slice(0, 200))}`;
  return NextResponse.redirect(failed);
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = sanitizeNext(url.searchParams.get("next"));

  // Server-side paths: PKCE code or token_hash + type.
  if (code || tokenHash) {
    const supabase = await createSupabaseServerClient();
    let exchangeError: { message: string } | null = null;
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      exchangeError = error ? { message: error.message } : null;
    } else if (tokenHash && type && ALLOWED_OTP_TYPES.has(type)) {
      const { error } = await supabase.auth.verifyOtp({
        type: type as "signup" | "magiclink" | "recovery" | "invite" | "email_change" | "email",
        token_hash: tokenHash,
      });
      exchangeError = error ? { message: error.message } : null;
    } else {
      exchangeError = { message: "Tipo de link no soportado" };
    }
    if (exchangeError) return failureRedirect(request, exchangeError.message);

    const dest = url.clone();
    dest.pathname = await resolveDestination(supabase, next);
    dest.search = "";
    return NextResponse.redirect(dest);
  }

  // Implicit flow fallback: tokens live in the URL hash, which we can only
  // read client-side. Return a minimal HTML page that POSTs them back to
  // this same route.
  const nextEsc = JSON.stringify(next);
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Confirmando…</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 0; padding: 40px; color: #555; }
  .box { max-width: 320px; margin: 80px auto; text-align: center; }
</style>
</head>
<body>
<div class="box">
  <p>Confirmando tu cuenta…</p>
</div>
<script>
(async () => {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) {
    window.location.replace("/login?error=missing_code");
    return;
  }
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) {
    window.location.replace("/login?error=missing_code");
    return;
  }
  try {
    const r = await fetch("/auth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token, next: ${nextEsc} }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.redirect) {
      window.location.replace("/login?error=" + encodeURIComponent(j.error || "session_failed"));
      return;
    }
    window.location.replace(j.redirect);
  } catch (e) {
    window.location.replace("/login?error=session_failed");
  }
})();
</script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  let body: { access_token?: string; refresh_token?: string; next?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const access_token = String(body.access_token ?? "");
  const refresh_token = String(body.refresh_token ?? "");
  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: "missing_tokens" }, { status: 400 });
  }
  const next = sanitizeNext(body.next);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    return NextResponse.json({ error: error.message.slice(0, 200) }, { status: 400 });
  }
  const redirectTo = await resolveDestination(supabase, next);
  return NextResponse.json({ redirect: redirectTo });
}
