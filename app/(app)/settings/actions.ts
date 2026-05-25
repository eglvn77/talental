"use server";

import { revalidatePath } from "next/cache";
import {
  hiring,
  getRequestWorkspaceId,
  type CustomFieldKind,
  type EntityType,
  type ProcessTemplateRow,
  type ProcessTemplateStageRow,
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

// =====================================================
// Profile + workspace identity (small, surfaced inline in /settings)
// =====================================================

/**
 * Update the current user's display name. Anyone authenticated can
 * edit their own row — RLS on team_members already restricts the row
 * to `auth_user_id = auth.uid()`, so the update can't reach anyone
 * else's record even if a stale id sneaked through.
 */
export async function updateMyProfileAction(input: {
  fullName: string;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };
  const trimmed = input.fullName.trim();
  if (!trimmed) return { ok: false, error: "El nombre no puede estar vacío." };
  const db = await hiring();
  const { error } = await db
    .from("team_members")
    .update({ full_name: trimmed })
    .eq("id", me.team_member.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/profile");
  return { ok: true };
}

/**
 * Rename the workspace. Admin-gated at the action level, but the
 * underlying RLS policy on hiring.workspaces only allows updates from
 * the owner — so we route through service-role for admin renames.
 * Keep the scope tight: ONLY `name` is patched here; plan_tier,
 * billing_email, etc. stay behind the owner-only RLS path.
 */
export async function updateWorkspaceNameAction(input: {
  name: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const trimmed = input.name.trim();
  if (!trimmed) return { ok: false, error: "El nombre no puede estar vacío." };
  const workspaceId = await getRequestWorkspaceId();
  // SERVICE ROLE: workspace.name rename — RLS only allows owner UPDATE
  // on hiring.workspaces, but renaming is an admin-level concern. We
  // gate on isAdmin above and patch a single column to keep the
  // bypass minimal-blast-radius.
  const admin = getSupabaseAdmin().schema("hiring");
  const { error } = await admin
    .from("workspaces")
    .update({ name: trimmed })
    .eq("id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/team");
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
  isFilterable?: boolean;
  isVisibleInColumns?: boolean;
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
      is_filterable: input.isFilterable ?? false,
      is_visible_in_columns: input.isVisibleInColumns ?? false,
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
  isFilterable?: boolean;
  isVisibleInColumns?: boolean;
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
  if (input.isFilterable !== undefined) {
    patch.is_filterable = input.isFilterable;
  }
  if (input.isVisibleInColumns !== undefined) {
    patch.is_visible_in_columns = input.isVisibleInColumns;
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
// Process templates (admin-only)
//
// Templates are workspace-wide pipeline blueprints. Editing a template
// does NOT propagate to existing vacantes — once a job is created, its
// pipeline_stages are independent rows. This keeps candidates from
// suddenly landing in a non-existent stage when an admin trims the
// template months later.
// =====================================================

const PIPELINE_CATEGORIES = [
  "sourced",
  "applicants",
  "shortlisted",
  "contacted",
  "conversation",
  "screen",
  "submitted",
  "client_interview",
  "assessment",
  "background_check",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
type PipelineCategoryLit = (typeof PIPELINE_CATEGORIES)[number];

function isPipelineCategory(v: string): v is PipelineCategoryLit {
  return (PIPELINE_CATEGORIES as readonly string[]).includes(v);
}

function sanitizeHexColor(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#94a3b8";
}

export async function createProcessTemplateAction(input: {
  name: string;
  description?: string | null;
  isDefault?: boolean;
  autoMoveContactedOnOutbound?: boolean;
  autoMoveAnsweredOnReply?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // If the admin checked "set as default" at create time, clear the
  // existing default first so the unique-default index doesn't trip.
  if (input.isDefault) {
    const { error: clearErr } = await db
      .from("process_templates")
      .update({ is_default: false })
      .eq("workspace_id", workspaceId)
      .eq("is_default", true);
    if (clearErr) return { ok: false, error: clearErr.message.slice(0, 300) };
  }

  const { data, error } = await db
    .from("process_templates")
    .insert({
      workspace_id: workspaceId,
      name,
      description: input.description?.trim() || null,
      is_default: Boolean(input.isDefault),
      auto_move_contacted_on_outbound: Boolean(input.autoMoveContactedOnOutbound),
      auto_move_answered_on_reply: Boolean(input.autoMoveAnsweredOnReply),
      created_by_team_member_id: g.data.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message.slice(0, 300) || "No se pudo crear" };
  }
  revalidatePath("/settings/processes");
  return { ok: true, data: { id: data.id as string } };
}

export async function updateProcessTemplateAction(input: {
  id: string;
  name?: string;
  description?: string | null;
  isDefault?: boolean;
  autoMoveContactedOnOutbound?: boolean;
  autoMoveAnsweredOnReply?: boolean;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.name === "string") {
    const trimmed = input.name.trim();
    if (!trimmed) return { ok: false, error: "El nombre es obligatorio." };
    patch.name = trimmed;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (typeof input.autoMoveContactedOnOutbound === "boolean") {
    patch.auto_move_contacted_on_outbound = input.autoMoveContactedOnOutbound;
  }
  if (typeof input.autoMoveAnsweredOnReply === "boolean") {
    patch.auto_move_answered_on_reply = input.autoMoveAnsweredOnReply;
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Setting this template as the workspace default is a two-step
  // operation (clear prior default, then flip this one) so the
  // unique-default index doesn't fire. Mirror what
  // setDefaultProcessTemplateAction does, inline.
  if (input.isDefault === true) {
    const { error: clearErr } = await db
      .from("process_templates")
      .update({ is_default: false })
      .eq("workspace_id", workspaceId)
      .eq("is_default", true);
    if (clearErr) return { ok: false, error: clearErr.message.slice(0, 300) };
    patch.is_default = true;
  } else if (input.isDefault === false) {
    // Explicit unset: only allowed if there's another template in
    // the workspace to fall back on. Otherwise the workspace would
    // end up with zero defaults and /jobs/new would have no fallback.
    const { data: others } = await db
      .from("process_templates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .neq("id", input.id)
      .limit(1);
    if (!others || others.length === 0) {
      return {
        ok: false,
        error: "No puedes desmarcar el único proceso del workspace.",
      };
    }
    patch.is_default = false;
  }

  const { error } = await db
    .from("process_templates")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/processes");
  revalidatePath(`/settings/processes/${input.id}`);
  return { ok: true };
}

export async function setDefaultProcessTemplateAction(input: {
  id: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  // Unique index `process_templates_one_default_per_workspace` enforces
  // a single default. Clear the prior default first so the new pick
  // succeeds even when one already exists.
  const { error: clearErr } = await db
    .from("process_templates")
    .update({ is_default: false })
    .eq("workspace_id", workspaceId)
    .eq("is_default", true);
  if (clearErr) return { ok: false, error: clearErr.message.slice(0, 300) };
  const { error } = await db
    .from("process_templates")
    .update({ is_default: true })
    .eq("id", input.id)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/processes");
  return { ok: true };
}

export async function duplicateProcessTemplateAction(input: {
  id: string;
}): Promise<ActionResult<{ id: string }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: src, error: srcErr } = await db
    .from("process_templates")
    .select("name, description")
    .eq("id", input.id)
    .maybeSingle();
  if (srcErr || !src) {
    return { ok: false, error: srcErr?.message || "Template no encontrado" };
  }

  const { data: stages, error: stagesErr } = await db
    .from("process_template_stages")
    .select("name, category, color, position, client_portal_visible")
    .eq("template_id", input.id)
    .order("position", { ascending: true });
  if (stagesErr) return { ok: false, error: stagesErr.message.slice(0, 300) };

  const { data: copy, error: copyErr } = await db
    .from("process_templates")
    .insert({
      workspace_id: workspaceId,
      name: `${src.name as string} (copia)`,
      description: (src.description as string | null) ?? null,
      is_default: false,
      created_by_team_member_id: g.data.id,
    })
    .select("id")
    .single();
  if (copyErr || !copy) {
    return { ok: false, error: copyErr?.message.slice(0, 300) || "No se pudo duplicar" };
  }

  if (stages && stages.length > 0) {
    const rows = stages.map((s, i) => ({
      template_id: copy.id as string,
      name: s.name as string,
      category: s.category,
      color: s.color as string,
      position: i,
      client_portal_visible: Boolean(s.client_portal_visible),
    }));
    const { error: insErr } = await db
      .from("process_template_stages")
      .insert(rows);
    if (insErr) return { ok: false, error: insErr.message.slice(0, 300) };
  }
  revalidatePath("/settings/processes");
  return { ok: true, data: { id: copy.id as string } };
}

export async function deleteProcessTemplateAction(input: {
  id: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  // Block deleting the workspace's default — every workspace needs at
  // least one template at the ready for /jobs/new.
  const { data: row } = await db
    .from("process_templates")
    .select("is_default")
    .eq("id", input.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (row?.is_default) {
    return {
      ok: false,
      error:
        "No puedes eliminar el proceso por defecto. Marca otro como predeterminado primero.",
    };
  }
  const { error } = await db
    .from("process_templates")
    .delete()
    .eq("id", input.id)
    .eq("workspace_id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/processes");
  return { ok: true };
}

/**
 * Fetch one template with its stages + a flag indicating whether it's
 * the workspace's only template. The settings dialog uses this on
 * open to populate the form + stages list in a single round trip.
 */
export async function loadProcessTemplateForEditAction(input: {
  id: string;
}): Promise<
  ActionResult<{
    template: ProcessTemplateRow;
    stages: ProcessTemplateStageRow[];
    isOnlyTemplate: boolean;
  }>
> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const [tplRes, stagesRes, countRes] = await Promise.all([
    db.from("process_templates").select("*").eq("id", input.id).maybeSingle(),
    db
      .from("process_template_stages")
      .select("*")
      .eq("template_id", input.id)
      .order("position", { ascending: true }),
    db.from("process_templates").select("id", { count: "exact", head: true }),
  ]);
  if (tplRes.error || !tplRes.data) {
    return { ok: false, error: tplRes.error?.message || "No encontrado" };
  }
  return {
    ok: true,
    data: {
      template: tplRes.data as ProcessTemplateRow,
      stages: (stagesRes.data ?? []) as ProcessTemplateStageRow[],
      isOnlyTemplate: (countRes.count ?? 1) <= 1,
    },
  };
}

// ----- stages -----

export async function createProcessTemplateStageAction(input: {
  templateId: string;
  name: string;
  category: string;
  color?: string;
  clientPortalVisible?: boolean;
}): Promise<ActionResult<{ id: string; stage: ProcessTemplateStageRow }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  if (!isPipelineCategory(input.category)) {
    return { ok: false, error: "Categoría inválida." };
  }
  const db = await hiring();

  // Insert at the top of the list — admins are usually adding an
  // upstream step (a new earlier screen, a new sourced bucket) and
  // putting it at the bottom buries it under the terminal stages.
  // Shift every existing stage one slot down so position 0 frees up.
  const { data: existing } = await db
    .from("process_template_stages")
    .select("id, position")
    .eq("template_id", input.templateId)
    .order("position", { ascending: false });
  for (const s of existing ?? []) {
    const { error: shiftErr } = await db
      .from("process_template_stages")
      .update({ position: (s.position as number) + 1 })
      .eq("id", s.id as string);
    if (shiftErr) {
      return { ok: false, error: shiftErr.message.slice(0, 300) };
    }
  }

  const { data, error } = await db
    .from("process_template_stages")
    .insert({
      template_id: input.templateId,
      name,
      category: input.category,
      color: sanitizeHexColor(input.color),
      position: 0,
      client_portal_visible: Boolean(input.clientPortalVisible),
    })
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message.slice(0, 300) || "No se pudo crear" };
  }
  revalidatePath(`/settings/processes`);
  return {
    ok: true,
    data: {
      id: data.id as string,
      stage: data as ProcessTemplateStageRow,
    },
  };
}

export async function updateProcessTemplateStageAction(input: {
  id: string;
  templateId: string;
  name?: string;
  category?: string;
  color?: string;
  clientPortalVisible?: boolean;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const patch: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const trimmed = input.name.trim();
    if (!trimmed) return { ok: false, error: "El nombre es obligatorio." };
    patch.name = trimmed;
  }
  if (typeof input.category === "string") {
    if (!isPipelineCategory(input.category)) {
      return { ok: false, error: "Categoría inválida." };
    }
    patch.category = input.category;
  }
  if (typeof input.color === "string") {
    patch.color = sanitizeHexColor(input.color);
  }
  if (typeof input.clientPortalVisible === "boolean") {
    patch.client_portal_visible = input.clientPortalVisible;
  }
  const db = await hiring();
  const { error } = await db
    .from("process_template_stages")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath(`/settings/processes/${input.templateId}`);
  return { ok: true };
}

export async function deleteProcessTemplateStageAction(input: {
  id: string;
  templateId: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { error } = await db
    .from("process_template_stages")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath(`/settings/processes/${input.templateId}`);
  return { ok: true };
}

export async function reorderProcessTemplateStagesAction(input: {
  templateId: string;
  orderedIds: string[];
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  for (let i = 0; i < input.orderedIds.length; i++) {
    const { error } = await db
      .from("process_template_stages")
      .update({ position: i })
      .eq("id", input.orderedIds[i])
      .eq("template_id", input.templateId);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  }
  revalidatePath(`/settings/processes/${input.templateId}`);
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
