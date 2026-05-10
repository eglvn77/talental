import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Handles the email-link callback for both magic links and password reset.
 * Supabase appends `?code=<otp>` to the redirect URL; we exchange it for a
 * session cookie and bounce to the destination.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/admin/hiring";

  if (!code) {
    const failed = url.clone();
    failed.pathname = "/admin/login";
    failed.search = "?error=missing_code";
    return NextResponse.redirect(failed);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const failed = url.clone();
    failed.pathname = "/admin/login";
    failed.search = `?error=${encodeURIComponent(error.message.slice(0, 200))}`;
    return NextResponse.redirect(failed);
  }

  const dest = url.clone();
  dest.pathname = next.startsWith("/") ? next : "/admin/hiring";
  dest.search = "";
  return NextResponse.redirect(dest);
}
