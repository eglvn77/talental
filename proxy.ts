import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that don't require an active Supabase session.
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

// Match every route except auth pages, API routes, Next internals, and static
// assets. The handler explicitly allows /login and /auth/* to render
// unauthenticated.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|favicon\\.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)",
  ],
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
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If they're already signed in and visiting /login, /signup, or
  // /forgot-password, bounce to the app. /reset-password is intentionally
  // excluded — a recovery session is technically signed in.
  if (
    user &&
    (pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/forgot-password"))
  ) {
    const home = request.nextUrl.clone();
    home.pathname = "/jobs";
    home.search = "";
    return NextResponse.redirect(home);
  }

  // Onboarding gate: redirect signed-in users whose workspace hasn't completed
  // onboarding to /onboarding. Skip the check for public routes and the
  // recovery flow (no point gating there).
  if (user && !isPublic) {
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
    const completedAt = workspaceRow?.onboarding_completed_at ?? null;
    const onOnboarding = pathname.startsWith("/onboarding");

    if (!completedAt && !onOnboarding) {
      const onboarding = request.nextUrl.clone();
      onboarding.pathname = "/onboarding";
      onboarding.search = "";
      return NextResponse.redirect(onboarding);
    }
    if (completedAt && onOnboarding) {
      const home = request.nextUrl.clone();
      home.pathname = "/jobs";
      home.search = "";
      return NextResponse.redirect(home);
    }
  }

  return supabaseResponse;
}
