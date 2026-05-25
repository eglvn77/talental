import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { readCustomClaims } from "@/lib/auth/jwt-claims";

// Routes that don't require an active Supabase session.
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/brand-demo",
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

  // ===== Careers subdomain handling =====
  // The public careers site lives at `jobs.<root>` (e.g.
  // jobs.talental.mx). Detect that host and rewrite the path to
  // `/careers/<rest>` so a single Next app serves both the
  // authenticated product (main domain) and the anonymous careers
  // pages (subdomain). The visible URL stays as the subdomain —
  // rewrite, not redirect.
  //
  // We bail before the Supabase auth check below because the careers
  // pages are public and must work without a session. The careers
  // route group has no `(app)` layout, so it doesn't pull the
  // authenticated sidebar/top-bar chrome.
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const isCareersSubdomain = host.startsWith("jobs.");
  const isCareersPath = pathname === "/careers" || pathname.startsWith("/careers/");

  if (isCareersSubdomain) {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = pathname === "/"
      ? "/careers"
      : `/careers${pathname}`;
    return NextResponse.rewrite(rewritten);
  }
  if (isCareersPath) {
    // Direct /careers/... access on the main domain (dev/preview
    // without DNS) — public, no auth gate.
    return NextResponse.next({ request });
  }

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

  // Onboarding gate. Fast path: read `onboarded_at` from JWT claims set
  // by the Custom Access Token Hook (no DB round-trip). Slow fallback:
  // query team_members + workspaces when the hook isn't enabled yet,
  // so the system works during the rollout window.
  if (user && !isPublic) {
    const onOnboarding = pathname.startsWith("/onboarding");

    const { data: sessionData } = await supabase.auth.getSession();
    const claims = readCustomClaims(sessionData.session?.access_token);
    let completedAt: string | null;

    if (claims.workspace_id !== undefined) {
      completedAt = claims.onboarded_at ?? null;
    } else {
      // Hook not enabled — fall back to the original lookup.
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
      completedAt = workspaceRow?.onboarding_completed_at ?? null;
    }

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
