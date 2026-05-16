"use server";

import { revalidatePath } from "next/cache";
import {
  hiring,
  getRequestWorkspaceId,
  type CustomFieldKind,
  type EntityType,
} from "@/lib/hiring";
import { isAuthenticated } from "@/lib/auth/session";
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
