import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auth-aware Supabase client for server components, server actions, and
 * route handlers. Reads/writes the session cookie via Next.js `cookies()`.
 *
 * Use this when you need `supabase.auth.getUser()` or session-aware queries.
 * For privileged service-role queries that bypass RLS, use
 * `getSupabaseAdmin()` from `@/lib/supabase`.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // `cookies().set` throws when called from a server component (read-only
        // context). We swallow the error: the proxy keeps the session in sync,
        // so the only impact here is that token refresh in a render won't
        // persist until the next mutation.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* noop — read-only render */
        }
      },
    },
  });
}
