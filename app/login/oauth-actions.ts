"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { sanitizeNext } from "./sanitize-next";

export async function googleOAuthAction(formData: FormData) {
  const next = sanitizeNext(String(formData.get("next") ?? ""));
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message.slice(0, 200))}`);
  }
  if (data.url) {
    redirect(data.url);
  }
  // Should never reach here.
  redirect("/login?error=oauth_no_url");
}
