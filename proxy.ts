import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that don't require an active Supabase session.
const PUBLIC_PREFIXES = [
  "/admin/login",
  "/auth/callback",
];

// Apply only to /admin/* — Manatal client portals (`/p/*`) and public site
// continue to handle their own access control.
export const config = {
  matcher: ["/admin/:path*"],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Carry-through response so cookie writes from token refresh propagate.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Always validate against Supabase (don't trust the cookie blindly).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If they're already signed in and visiting /admin/login, bounce to the app.
  if (user && pathname.startsWith("/admin/login")) {
    const home = request.nextUrl.clone();
    home.pathname = "/admin/hiring";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return supabaseResponse;
}
