"use server";

import { isAuthenticated } from "@/lib/auth/session";

/**
 * Discriminated union returned by every server action so call sites can
 * branch on `res.ok` without TS gymnastics. `data` is only present on
 * actions that return a value.
 */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Minimum auth gate. RLS is the real workspace boundary; this just
 * ensures the request has a Supabase session before running anything
 * with side effects.
 */
export async function ensureAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!(await isAuthenticated())) return { ok: false, error: "Unauthorized" };
  return { ok: true };
}
