"use server";

import { revalidatePath } from "next/cache";
import {
  hiring,
  getRequestWorkspaceId,
  type CustomFieldKind,
  type EntityType,
  type PromptRow,
} from "@/lib/hiring";
import { getCurrentUser, isAuthenticated } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/team";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_MASTER_PROMPT } from "@/lib/kickoff/default-master-prompt";
import { isEntityType } from "./_lib/entities";

/** Roles an admin can assign through the Equipo UI. Owner is set
 *  once at workspace creation and isn't picker-selectable to keep
 *  the "there's always exactly one owner" invariant simple. */
type AssignableRole = "admin" | "recruiter";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const KIND_VALUES: ReadonlyArray<CustomFieldKind> = [
  "text",
  "long_text",
  "number",
  "boolean",
  "date",
  "select",
  "multi_select",
  "url",
  "email",
];

function isKind(v: string): v is CustomFieldKind {
  return (KIND_VALUES as readonly string[]).includes(v);
}

async function guard(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAuthenticated())) return { ok: false, error: "Unauthorized" };
  return { ok: true };
}

function normalizeOptions(
  kind: CustomFieldKind,
  raw: unknown,
): string[] | null {
  if (kind !== "select" && kind !== "multi_select") return null;
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
  return Array.from(new Set(cleaned));
}

export async function createCustomFieldAction(input: {
  entityType: string;
  key: string;
  label: string;
  kind: string;
  description?: string;
  isRequired?: boolean;
  options?: string[];
}): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;

  const label = input.label.trim();
  const key = input.key.trim();
  if (!label) return { ok: false, error: "El label es obligatorio" };
  if (!key) return { ok: false, error: "El key es obligatorio" };
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return {
      ok: false,
      error: "El key debe iniciar con letra minúscula y solo usar a-z, 0-9, _",
    };
  }
  if (!isEntityType(input.entityType)) {
    return { ok: false, error: "Entidad inválida" };
  }
  if (!isKind(input.kind)) {
    return { ok: false, error: "Tipo de campo inválido" };
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: existing } = await db
    .from("custom_field_definitions")
    .select("position")
    .eq("entity_type", input.entityType)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition =
    existing && existing.length > 0
      ? (existing[0].position as number) + 1
      : 0;

  const { data, error } = await db
    .from("custom_field_definitions")
    .insert({
      workspace_id: workspaceId,
      entity_type: input.entityType as EntityType,
      key,
      label,
      kind: input.kind as CustomFieldKind,
      description: input.description?.trim() || null,
      is_required: input.isRequired ?? false,
      options: normalizeOptions(input.kind as CustomFieldKind, input.options),
      position: nextPosition,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Ya existe un campo con ese key para esta entidad",
      };
    }
    return { ok: false, error: error.message.slice(0, 300) };
  }

  revalidatePath(`/settings/custom-fields/${input.entityType}`);
  return { ok: true, data: { id: data!.id as string } };
}

export async function updateCustomFieldAction(input: {
  id: string;
  label?: string;
  kind?: string;
  description?: string | null;
  isRequired?: boolean;
  options?: string[];
}): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) {
    const t = input.label.trim();
    if (!t) return { ok: false, error: "El label es obligatorio" };
    patch.label = t;
  }
  if (input.kind !== undefined) {
    if (!isKind(input.kind)) {
      return { ok: false, error: "Tipo de campo inválido" };
    }
    patch.kind = input.kind;
    if (input.options !== undefined) {
      patch.options = normalizeOptions(input.kind, input.options);
    }
  } else if (input.options !== undefined) {
    // options changed without kind change — only valid for select kinds.
    // We trust the caller to send a consistent payload; the DB will accept
    // any jsonb, so no DB-side check needed.
    patch.options = input.options;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.isRequired !== undefined) {
    patch.is_required = input.isRequired;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nada que actualizar" };
  }

  const db = await hiring();
  const { data: existing, error: readErr } = await db
    .from("custom_field_definitions")
    .select("entity_type")
    .eq("id", input.id)
    .maybeSingle();
  if (readErr || !existing) return { ok: false, error: "Campo no encontrado" };

  const { error } = await db
    .from("custom_field_definitions")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath(
    `/settings/custom-fields/${existing.entity_type as string}`,
  );
  return { ok: true };
}

export async function deleteCustomFieldAction(
  id: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const db = await hiring();
  const { data: existing } = await db
    .from("custom_field_definitions")
    .select("entity_type")
    .eq("id", id)
    .maybeSingle();
  const { error } = await db
    .from("custom_field_definitions")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  if (existing) {
    revalidatePath(
      `/settings/custom-fields/${existing.entity_type as string}`,
    );
  }
  return { ok: true };
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Upsert (or delete when empty) a single custom field value for one
 * entity. The (definition_id, entity_id) pair is unique in the DB.
 */
export async function upsertCustomFieldValueAction(input: {
  definitionId: string;
  entityId: string;
  value: unknown;
}): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const db = await hiring();

  // Resolve workspace_id + entity_type from the definition (single
  // source of truth; the client doesn't need to send them).
  const { data: def, error: defErr } = await db
    .from("custom_field_definitions")
    .select("workspace_id, entity_type")
    .eq("id", input.definitionId)
    .maybeSingle();
  if (defErr || !def) {
    return { ok: false, error: "Definición no encontrada" };
  }

  if (isEmpty(input.value)) {
    const { error } = await db
      .from("custom_field_values")
      .delete()
      .eq("definition_id", input.definitionId)
      .eq("entity_id", input.entityId);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
    return { ok: true };
  }

  const { error } = await db.from("custom_field_values").upsert(
    {
      workspace_id: def.workspace_id as string,
      definition_id: input.definitionId,
      entity_type: def.entity_type as string,
      entity_id: input.entityId,
      value: input.value as never,
    },
    { onConflict: "definition_id,entity_id" },
  );
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return { ok: true };
}

export async function reorderCustomFieldsAction(input: {
  entityType: string;
  orderedIds: string[];
}): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  if (!isEntityType(input.entityType)) {
    return { ok: false, error: "Entidad inválida" };
  }
  const db = await hiring();
  // Sequential updates — small N (typically <30), no need for a stored proc.
  for (let i = 0; i < input.orderedIds.length; i++) {
    const id = input.orderedIds[i];
    const { error } = await db
      .from("custom_field_definitions")
      .update({ position: i })
      .eq("id", id)
      .eq("entity_type", input.entityType);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  }
  revalidatePath(`/settings/custom-fields/${input.entityType}`);
  return { ok: true };
}

// =====================================================
// Prompts CMS (owner-only)
// =====================================================

const PROMPT_DEFAULTS: Record<
  string,
  { label: string; body: string; model: string }
> = {
  kickoff_master: {
    label: "Kickoff Master Prompt",
    body: DEFAULT_MASTER_PROMPT,
    model: "claude-sonnet-4-5",
  },
};

async function ownerGuard(): Promise<
  | { ok: true; workspaceId: string; teamMemberId: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  if (user.team_member.team_role !== "owner") {
    return { ok: false, error: "Solo el owner del workspace puede editar prompts." };
  }
  return {
    ok: true,
    workspaceId: user.workspace.id,
    teamMemberId: user.team_member.id,
  };
}

/**
 * Ensure a prompt row exists for this workspace + key. Seeds from
 * PROMPT_DEFAULTS when missing. Returns the row.
 */
export async function ensurePromptAction(
  key: string,
): Promise<ActionResult<{ prompt: PromptRow }>> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;
  const def = PROMPT_DEFAULTS[key];
  if (!def) return { ok: false, error: `Prompt "${key}" no es reconocido.` };

  const db = await hiring();
  const { data: existing } = await db
    .from("prompts")
    .select("*")
    .eq("workspace_id", guardResult.workspaceId)
    .eq("key", key)
    .maybeSingle();
  if (existing) return { ok: true, data: { prompt: existing as PromptRow } };

  const { data: created, error } = await db
    .from("prompts")
    .insert({
      workspace_id: guardResult.workspaceId,
      key,
      label: def.label,
      body: def.body,
      model: def.model,
      updated_by: guardResult.teamMemberId,
    })
    .select("*")
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message || "No se pudo crear el prompt" };
  }
  return { ok: true, data: { prompt: created as PromptRow } };
}

export async function updatePromptAction(input: {
  promptId: string;
  body: string;
  model?: string;
}): Promise<ActionResult> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;
  if (!input.body.trim()) {
    return { ok: false, error: "El body no puede estar vacío." };
  }
  const db = await hiring();
  const patch: Record<string, unknown> = {
    body: input.body,
    updated_by: guardResult.teamMemberId,
    updated_at: new Date().toISOString(),
  };
  if (input.model) patch.model = input.model;
  const { error } = await db
    .from("prompts")
    .update(patch)
    .eq("id", input.promptId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/prompts");
  return { ok: true };
}

export async function createPromptAction(input: {
  key: string;
  label: string;
  body: string;
  model: string;
}): Promise<ActionResult<{ id: string }>> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;

  const key = input.key.trim();
  const label = input.label.trim();
  const body = input.body;
  const model = input.model.trim();
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return {
      ok: false,
      error: "El key debe iniciar con letra minúscula y solo usar a-z, 0-9, _",
    };
  }
  if (!label) return { ok: false, error: "El label es requerido" };
  if (!body.trim()) return { ok: false, error: "El body es requerido" };
  if (!model) return { ok: false, error: "El modelo es requerido" };

  const db = await hiring();
  const { data, error } = await db
    .from("prompts")
    .insert({
      workspace_id: guardResult.workspaceId,
      key,
      label,
      body,
      model,
      updated_by: guardResult.teamMemberId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: "Ya existe un prompt con ese key." };
    }
    return { ok: false, error: error?.message || "No se pudo crear el prompt" };
  }
  revalidatePath("/settings/prompts");
  return { ok: true, data: { id: data.id as string } };
}

export async function deletePromptAction(input: {
  promptId: string;
  key: string;
}): Promise<ActionResult> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;
  // Don't allow deleting prompts that the product depends on.
  if (input.key === "kickoff_master") {
    return {
      ok: false,
      error: "Este prompt es requerido por el producto. Puedes editarlo o restaurar al default, pero no eliminarlo.",
    };
  }
  const db = await hiring();
  const { error } = await db
    .from("prompts")
    .delete()
    .eq("id", input.promptId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/prompts");
  return { ok: true };
}

export async function resetPromptToDefaultAction(input: {
  promptId: string;
  key: string;
}): Promise<ActionResult> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;
  const def = PROMPT_DEFAULTS[input.key];
  if (!def) return { ok: false, error: `Prompt "${input.key}" no es reconocido.` };

  const db = await hiring();
  const { error } = await db
    .from("prompts")
    .update({
      body: def.body,
      model: def.model,
      updated_by: guardResult.teamMemberId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.promptId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/prompts");
  return { ok: true };
}

// =====================================================
// Team management (admin-only) — invite, change role, deactivate
// =====================================================

function isAssignableRole(v: string): v is AssignableRole {
  return v === "admin" || v === "recruiter";
}

/**
 * Invite a new team member by email. Admin-only. Sends a Supabase
 * magic-link invite (which creates the auth.users row + emails the
 * recipient) and inserts a matching `team_members` row with the
 * chosen role, linked by `auth_user_id`. On first sign-in the
 * invitee lands directly into the workspace.
 *
 * If the email already exists as an active team_member of THIS
 * workspace, returns an error rather than re-inviting silently.
 */
export async function inviteTeamMemberAction(input: {
  email: string;
  fullName?: string;
  role: string;
}): Promise<ActionResult<{ teamMemberId: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const inviter = guard.data;

  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email inválido" };
  }
  if (!isAssignableRole(input.role)) {
    return { ok: false, error: "Rol inválido (admin | recruiter)" };
  }
  const fullName = input.fullName?.trim() || null;

  const db = await hiring();
  const { data: existing } = await db
    .from("team_members")
    .select("id, is_active")
    .eq("workspace_id", inviter.workspace_id)
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: existing.is_active
        ? "Ya hay un miembro activo con ese correo"
        : "Hay un miembro inactivo con ese correo — actívalo en vez de invitar de nuevo",
    };
  }

  // SERVICE ROLE: the auth-aware client can't write to auth.users.
  // Supabase's admin.inviteUserByEmail provisions the auth row +
  // sends the magic-link email in one call. We pass the chosen role
  // via user_metadata for the eventual claim hook.
  const admin = getSupabaseAdmin();
  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        workspace_id: inviter.workspace_id,
        team_role: input.role,
        full_name: fullName,
      },
    });
  if (inviteErr || !invited?.user) {
    return {
      ok: false,
      error: inviteErr?.message?.slice(0, 300) || "No se pudo enviar la invitación",
    };
  }

  // SERVICE ROLE: insert through the admin client so we can stamp
  // auth_user_id even though the recipient hasn't signed in yet;
  // the regular RLS path requires the inviter to BE the new user.
  const { data: inserted, error: insertErr } = await admin
    .schema("hiring")
    .from("team_members")
    .insert({
      workspace_id: inviter.workspace_id,
      auth_user_id: invited.user.id,
      email,
      full_name: fullName,
      team_role: input.role,
      is_active: true,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    // Roll back the invited auth user so a retry doesn't trip on
    // "email already exists" from Supabase auth.
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => undefined);
    return {
      ok: false,
      error: insertErr?.message?.slice(0, 300) || "No se pudo registrar al miembro",
    };
  }

  revalidatePath("/settings/team");
  return { ok: true, data: { teamMemberId: inserted.id as string } };
}

/**
 * Change a team member's role. Admin-only. Can't downgrade the
 * sole owner of a workspace (keeps the invariant that every
 * workspace has at least one owner).
 */
export async function updateTeamMemberRoleAction(input: {
  memberId: string;
  role: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const acting = guard.data;

  if (!isAssignableRole(input.role)) {
    return { ok: false, error: "Rol inválido (admin | recruiter)" };
  }

  const db = await hiring();
  const { data: target, error: readErr } = await db
    .from("team_members")
    .select("id, team_role, workspace_id")
    .eq("id", input.memberId)
    .maybeSingle();
  if (readErr || !target) {
    return { ok: false, error: "Miembro no encontrado" };
  }
  if (target.workspace_id !== acting.workspace_id) {
    return { ok: false, error: "Cross-workspace edit no permitido" };
  }
  // Demoting an owner would leave the workspace without one if they
  // were the last. Block the case entirely — owner changes go
  // through a separate, dedicated flow (transfer ownership).
  if (target.team_role === "owner") {
    return { ok: false, error: "El owner no se edita desde aquí" };
  }

  const { error } = await db
    .from("team_members")
    .update({ team_role: input.role as AssignableRole })
    .eq("id", input.memberId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/team");
  return { ok: true };
}

/**
 * Deactivate a team member. Admin-only. Can't deactivate yourself
 * (prevents accidental lock-out) and can't deactivate the owner.
 * Deactivated members lose access immediately — RLS reads
 * `is_active = true` to compute visibility.
 */
export async function deactivateTeamMemberAction(input: {
  memberId: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const acting = guard.data;

  if (input.memberId === acting.id) {
    return { ok: false, error: "No puedes desactivarte a ti mismo" };
  }

  const db = await hiring();
  const { data: target } = await db
    .from("team_members")
    .select("id, team_role, workspace_id")
    .eq("id", input.memberId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Miembro no encontrado" };
  if (target.workspace_id !== acting.workspace_id) {
    return { ok: false, error: "Cross-workspace edit no permitido" };
  }
  if (target.team_role === "owner") {
    return { ok: false, error: "No se puede desactivar al owner" };
  }

  const { error } = await db
    .from("team_members")
    .update({ is_active: false })
    .eq("id", input.memberId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/team");
  return { ok: true };
}

/**
 * Re-activate a previously-deactivated member. Admin-only. Pairs
 * with the "inactive" error path of inviteTeamMemberAction.
 */
export async function reactivateTeamMemberAction(input: {
  memberId: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const acting = guard.data;

  const db = await hiring();
  const { data: target } = await db
    .from("team_members")
    .select("id, workspace_id")
    .eq("id", input.memberId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Miembro no encontrado" };
  if (target.workspace_id !== acting.workspace_id) {
    return { ok: false, error: "Cross-workspace edit no permitido" };
  }

  const { error } = await db
    .from("team_members")
    .update({ is_active: true })
    .eq("id", input.memberId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/team");
  return { ok: true };
}
