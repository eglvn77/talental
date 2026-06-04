"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { requireAdmin } from "@/lib/auth/team";
import { getCurrentUser } from "@/lib/auth/session";
import { newPortalSlug } from "@/lib/portal/slug";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Create a new shareable portal token. Scope is either a single job
 * or an entire company (the client sees every job of that company).
 */
export async function createPortalTokenAction(input: {
  scope: "job" | "company";
  jobId?: string;
  companyId?: string;
  label?: string;
}): Promise<ActionResult<{ id: string; slug: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  if (input.scope === "job") {
    if (!input.jobId) return { ok: false, error: "jobId requerido" };
  } else if (input.scope === "company") {
    if (!input.companyId) return { ok: false, error: "companyId requerido" };
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
  } else {
    revalidatePath(`/companies`);
  }
  return { ok: true, data: { id: data.id as string, slug: data.slug as string } };
}

/** Soft-revoke a token. Slug becomes invalid; row stays for audit. */
export async function revokePortalTokenAction(input: {
  tokenId: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
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

/**
 * Revoke the old token and mint a fresh one for the same target.
 * Use when a client leaks the link.
 */
export async function regeneratePortalTokenAction(input: {
  tokenId: string;
}): Promise<ActionResult<{ id: string; slug: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const db = await hiring();
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

/**
 * Per-job visibility toggles (show email/phone/LinkedIn/salary/CV,
 * allow client comments). Upserts the row by job_id.
 */
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
  const db = await hiring();

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
