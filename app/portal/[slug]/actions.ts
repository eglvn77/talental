"use server";

import { redirect } from "next/navigation";
import { resolvePortalToken } from "@/lib/portal/resolve-token";
import { isValidEmail, startPortalSession } from "@/lib/portal/session";

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Public action — sets the portal session cookie for a (slug, email)
 * pair. Anyone can call it; the slug IS the auth boundary. Trust-only
 * email — no verification, just attribution.
 */
export async function portalLoginAction(input: {
  slug: string;
  email: string;
}): Promise<Result> {
  const token = await resolvePortalToken(input.slug);
  if (!token) return { ok: false, error: "tokenInvalid" };
  if (!isValidEmail(input.email)) return { ok: false, error: "emailInvalid" };
  await startPortalSession(token, input.email);
  redirect(`/portal/${input.slug}`);
}
