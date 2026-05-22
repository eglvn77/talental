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
import { DEFAULT_MASTER_PROMPT } from "@/lib/kickoff/default-master-prompt";
import { isEntityType } from "./_lib/entities";

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
