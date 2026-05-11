"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ActionResult = { ok: true } | { ok: false; error: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function completeOnboardingAction(
  formData: FormData,
): Promise<ActionResult> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const agencyName = String(formData.get("agency_name") ?? "").trim();

  if (fullName.length < 2) {
    return { ok: false, error: "Tu nombre debe tener al menos 2 caracteres." };
  }
  if (agencyName.length < 2) {
    return {
      ok: false,
      error: "El nombre del equipo debe tener al menos 2 caracteres.",
    };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No hay sesión activa." };

  // SERVICE ROLE: onboarding — update workspace + team_member atomically,
  // bypassing RLS (workspace.UPDATE is owner-only; this is the owner setting
  // it up for the first time and we want a single guaranteed write path).
  const admin = getSupabaseAdmin();
  const db = admin.schema("hiring");

  const workspaceId = user.workspace.id;

  // Regenerate slug with dedupe (exclude self so re-saving same name is safe).
  const baseSlug = slugify(agencyName);
  if (!baseSlug) {
    return {
      ok: false,
      error: "No pudimos generar un slug. Intenta con otro nombre.",
    };
  }
  let slug = baseSlug;
  let attempt = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: collision } = await db
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .neq("id", workspaceId)
      .maybeSingle();
    if (!collision) break;
    attempt += 1;
    if (attempt > 100) {
      return {
        ok: false,
        error: "No pudimos generar un slug. Intenta con otro nombre.",
      };
    }
    slug = `${baseSlug}-${attempt}`;
  }

  const { error: wsErr } = await db
    .from("workspaces")
    .update({
      name: agencyName,
      slug,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);
  if (wsErr) {
    return { ok: false, error: wsErr.message.slice(0, 200) };
  }

  const { error: memberErr } = await db
    .from("team_members")
    .update({ full_name: fullName })
    .eq("id", user.team_member.id);
  if (memberErr) {
    return { ok: false, error: memberErr.message.slice(0, 200) };
  }

  redirect("/jobs");
}
