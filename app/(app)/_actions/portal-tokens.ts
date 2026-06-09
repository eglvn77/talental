"use server";

import { revalidatePath } from "next/cache";
import { getRequestWorkspaceId } from "@/lib/hiring";
import { requireAdmin } from "@/lib/auth/team";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { newPortalSlug } from "@/lib/portal/slug";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Portal tables (portal_tokens / portal_sessions / portal_comments /
 * portal_allowed_emails) are service_role only — anon/authenticated
 * are explicitly REVOKEd in the migration. All admin actions go
 * through the service-role client; authorization is enforced by
 * `requireAdmin()` at the top of each one.
 */
function adminDb() {
  return getSupabaseAdmin().schema("hiring");
}

/** Create a new shareable portal link. */
export async function createPortalTokenAction(input: {
  scope: "job" | "company" | "application";
  jobId?: string;
  companyId?: string;
  applicationId?: string;
  label?: string;
}): Promise<ActionResult<{ id: string; slug: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };
  const workspaceId = await getRequestWorkspaceId();
  const db = adminDb();

  if (input.scope === "job") {
    if (!input.jobId) return { ok: false, error: "jobId requerido" };
  } else if (input.scope === "company") {
    if (!input.companyId) return { ok: false, error: "companyId requerido" };
  } else if (input.scope === "application") {
    if (!input.applicationId)
      return { ok: false, error: "applicationId requerido" };
  } else {
    return { ok: false, error: "scope inválido" };
  }

  const slug = newPortalSlug();
  const { data, error } = await db
    .from("portal_tokens")
    .insert({
      workspace_id: workspaceId,
      scope: input.scope,
      job_id: input.scope === "job" ? input.jobId! : null,
      company_id: input.scope === "company" ? input.companyId! : null,
      application_id:
        input.scope === "application" ? input.applicationId! : null,
      slug,
      label: input.label?.trim() || null,
      created_by: me.team_member.id,
    })
    .select("id, slug")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message?.slice(0, 300) ?? "DB error" };
  }

  if (input.scope === "job") {
    revalidatePath(`/jobs/${input.jobId}/portal`);
  } else if (input.scope === "company") {
    revalidatePath(`/companies`);
  } else {
    revalidatePath(`/candidates`);
  }
  return { ok: true, data: { id: data.id as string, slug: data.slug as string } };
}

/**
 * Convenience: get-or-create the application-scoped share token.
 * Multiple shares of the same application return the same slug so
 * the URL stays stable + dead tokens don't accumulate with each
 * "Share" click. If the previous token was revoked, makes a new
 * one.
 */
export async function getOrCreateApplicationShareTokenAction(input: {
  applicationId: string;
}): Promise<ActionResult<{ id: string; slug: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = adminDb();
  const { data: existing } = await db
    .from("portal_tokens")
    .select("id, slug, is_active")
    .eq("scope", "application")
    .eq("application_id", input.applicationId)
    .eq("is_active", true)
    .maybeSingle();
  if (existing && (existing as { is_active: boolean }).is_active) {
    return {
      ok: true,
      data: {
        id: (existing as { id: string }).id,
        slug: (existing as { slug: string }).slug,
      },
    };
  }
  return createPortalTokenAction({
    scope: "application",
    applicationId: input.applicationId,
  });
}

/**
 * Look up the most-recent share token for an application without
 * creating one. Used by the Share popover to render its current
 * state (none / active / revoked) before the user takes action.
 */
export async function getApplicationShareTokenAction(input: {
  applicationId: string;
}): Promise<
  ActionResult<{ slug: string; isActive: boolean } | null>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = adminDb();
  const { data } = await db
    .from("portal_tokens")
    .select("slug, is_active, revoked_at")
    .eq("scope", "application")
    .eq("application_id", input.applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { ok: true, data: null };
  const row = data as { slug: string; is_active: boolean };
  return {
    ok: true,
    data: { slug: row.slug, isActive: Boolean(row.is_active) },
  };
}

/**
 * Toggle the active state of an application share token. Disable
 * = sets is_active=false + revoked_at=now(). Enable = either flips
 * is_active back on if the existing token has the same id, OR
 * creates a fresh one via getOrCreateApplicationShareTokenAction.
 * The simpler "flip is_active" path keeps the URL stable across
 * disable/enable cycles, which is what a recruiter expects when
 * they pause-then-resume a candidate's share.
 */
export async function setApplicationShareTokenActiveAction(input: {
  applicationId: string;
  active: boolean;
}): Promise<ActionResult<{ slug: string; isActive: boolean }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = adminDb();
  const { data: existing } = await db
    .from("portal_tokens")
    .select("id, slug")
    .eq("scope", "application")
    .eq("application_id", input.applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing) {
    if (!input.active) {
      return { ok: false, error: "Nothing to disable" };
    }
    const created = await createPortalTokenAction({
      scope: "application",
      applicationId: input.applicationId,
    });
    if (!created.ok) return created;
    return {
      ok: true,
      data: { slug: created.data.slug, isActive: true },
    };
  }
  const tokenId = (existing as { id: string }).id;
  const { error } = await db
    .from("portal_tokens")
    .update({
      is_active: input.active,
      revoked_at: input.active ? null : new Date().toISOString(),
    })
    .eq("id", tokenId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath(`/candidates`);
  return {
    ok: true,
    data: {
      slug: (existing as { slug: string }).slug,
      isActive: input.active,
    },
  };
}

export async function revokePortalTokenAction(input: {
  tokenId: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = adminDb();
  const { data: existing, error: readErr } = await db
    .from("portal_tokens")
    .select("id, scope, job_id, company_id")
    .eq("id", input.tokenId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message.slice(0, 300) };
  if (!existing) return { ok: false, error: "Token no encontrado" };
  const { error } = await db
    .from("portal_tokens")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("id", input.tokenId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (existing.scope === "job" && existing.job_id) {
    revalidatePath(`/jobs/${existing.job_id}/portal`);
  } else {
    revalidatePath(`/companies`);
  }
  return { ok: true };
}

export async function regeneratePortalTokenAction(input: {
  tokenId: string;
}): Promise<ActionResult<{ id: string; slug: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = adminDb();
  const { data: existing, error: readErr } = await db
    .from("portal_tokens")
    .select("*")
    .eq("id", input.tokenId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message.slice(0, 300) };
  if (!existing) return { ok: false, error: "Token no encontrado" };

  await db
    .from("portal_tokens")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("id", input.tokenId);

  return createPortalTokenAction({
    scope: existing.scope as "job" | "company",
    jobId: (existing.job_id as string | null) ?? undefined,
    companyId: (existing.company_id as string | null) ?? undefined,
    label: (existing.label as string | null) ?? undefined,
  });
}

export async function updateJobPortalSettingsAction(input: {
  jobId: string;
  patch: Partial<{
    is_enabled: boolean;
    show_email: boolean;
    show_phone: boolean;
    show_linkedin_url: boolean;
    show_salary_expectations: boolean;
    show_attachments: boolean;
    show_notes: boolean;
    allow_feedback: boolean;
  }>;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const workspaceId = await getRequestWorkspaceId();
  const db = adminDb();

  const { data: existing } = await db
    .from("job_client_portal_settings")
    .select("job_id")
    .eq("job_id", input.jobId)
    .maybeSingle();

  const patch = {
    ...input.patch,
    ...(input.patch.show_notes !== undefined
      ? { allow_view_notes: input.patch.show_notes, show_notes: undefined }
      : {}),
    updated_at: new Date().toISOString(),
  };
  delete (patch as { show_notes?: boolean }).show_notes;

  if (existing) {
    const { error } = await db
      .from("job_client_portal_settings")
      .update(patch)
      .eq("job_id", input.jobId);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  } else {
    const { error } = await db
      .from("job_client_portal_settings")
      .insert({
        workspace_id: workspaceId,
        job_id: input.jobId,
        is_enabled: true,
        show_email: false,
        show_phone: false,
        show_linkedin_url: true,
        show_salary_expectations: true,
        show_attachments: true,
        allow_feedback: true,
        allow_view_notes: false,
        allow_candidate_movement: false,
        ...patch,
      });
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  }
  revalidatePath(`/jobs/${input.jobId}/portal`);
  return { ok: true };
}

// ============================================================
// Allowed-emails list per token
// ============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add an email to a token's whitelist. Idempotent — unique (token_id,
 * email) absorbs duplicates. Empty whitelist = open (any email can
 * enter); non-empty whitelist = the gate enforces it.
 */
export async function addPortalAllowedEmailAction(input: {
  tokenId: string;
  email: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Correo inválido" };
  const db = adminDb();
  const { data: tok } = await db
    .from("portal_tokens")
    .select("id, scope, job_id, company_id")
    .eq("id", input.tokenId)
    .maybeSingle();
  if (!tok) return { ok: false, error: "Token no encontrado" };
  const { error } = await db
    .from("portal_allowed_emails")
    .upsert(
      {
        token_id: input.tokenId,
        email,
        added_by: me.team_member.id,
      },
      { onConflict: "token_id,email", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (tok.scope === "job" && tok.job_id) {
    revalidatePath(`/jobs/${tok.job_id}/portal`);
  }
  return { ok: true };
}

export async function removePortalAllowedEmailAction(input: {
  allowedEmailId: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = adminDb();
  const { data: row } = await db
    .from("portal_allowed_emails")
    .select("token_id")
    .eq("id", input.allowedEmailId)
    .maybeSingle();
  if (!row) return { ok: false, error: "No encontrado" };
  const { error } = await db
    .from("portal_allowed_emails")
    .delete()
    .eq("id", input.allowedEmailId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  const { data: tok } = await db
    .from("portal_tokens")
    .select("scope, job_id")
    .eq("id", row.token_id as string)
    .maybeSingle();
  if (tok?.scope === "job" && tok.job_id) {
    revalidatePath(`/jobs/${tok.job_id}/portal`);
  }
  return { ok: true };
}
