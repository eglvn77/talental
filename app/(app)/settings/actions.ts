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
 * Upload a new profile avatar. Lives in the `avatars` storage bucket
 * under `<auth_user_id>/avatar-<ts>.<ext>` so the storage RLS
 * policies (foldername-based) hold. After the upload, we persist the
 * public URL on team_members.avatar_url so every place that loads the
 * user (sidebar, profile, team table) can pick it up.
 *
 * No service-role: the upload runs through the user's session and
 * the storage RLS policies enforce that the path's first segment
 * matches auth.uid().
 */
const AVATAR_ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadProfileAvatarAction(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "La imagen excede 5 MB." };
  }
  if (!AVATAR_ALLOWED_MIMES.has(file.type)) {
    return {
      ok: false,
      error: "Formato no soportado. Usa JPG, PNG, WebP o GIF.",
    };
  }

  // Path: <auth_user_id>/avatar-<ts>.<ext>. Timestamp ensures unique
  // URLs so the browser doesn't cache the previous image at the same
  // public URL, AND the storage RLS check (`foldername[1] = auth.uid`)
  // passes because the first segment is the user's auth id.
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${me.id}/avatar-${Date.now()}.${ext}`;

  const { createSupabaseServerClient } = await import(
    "@/lib/supabase/server"
  );
  const supabase = await createSupabaseServerClient();
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      contentType: file.type,
      // upsert=false so a race never silently overwrites — each upload
      // gets its own filename via the timestamp.
      upsert: false,
    });
  if (upErr) return { ok: false, error: upErr.message.slice(0, 300) };

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const db = await hiring();
  const { error: dbErr } = await db
    .from("team_members")
    .update({ avatar_url: publicUrl })
    .eq("id", me.team_member.id);
  if (dbErr) return { ok: false, error: dbErr.message.slice(0, 300) };

  revalidatePath("/settings/profile");
  revalidatePath("/", "layout"); // sidebar avatar lives in the root layout
  return { ok: true, data: { avatarUrl: publicUrl } };
}

/**
 * Remove the user's avatar — clears the column. Leaves orphan files in
 * the bucket; cleanup can be a follow-up.
 */
export async function removeProfileAvatarAction(): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Unauthorized" };
  const db = await hiring();
  const { error } = await db
    .from("team_members")
    .update({ avatar_url: null })
    .eq("id", me.team_member.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}

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
  revalidatePath("/", "layout"); // sidebar shows the user's name
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
  revalidatePath("/", "layout"); // sidebar shows the workspace name
  return { ok: true };
}

const COMPANY_STATUS_VALUES = ["none", "prospect", "client", "partner"] as const;
type CompanyStatusValue = (typeof COMPANY_STATUS_VALUES)[number];

/**
 * Rename / recolor one of the four fixed company statuses. The status
 * set is a Postgres enum (not add/delete-able); this only patches the
 * per-workspace display override stored in
 * workspaces.company_status_config (jsonb). Missing keys fall back to
 * the app defaults, so we only ever store what the admin changed.
 */
export async function updateCompanyStatusConfigAction(input: {
  status: CompanyStatusValue;
  label?: string;
  color?: string | null;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  if (!COMPANY_STATUS_VALUES.includes(input.status)) {
    return { ok: false, error: "Estatus inválido." };
  }
  const workspaceId = await getRequestWorkspaceId();

  // SERVICE ROLE: RLS only allows owner UPDATE on hiring.workspaces;
  // editing the status display config is an admin-level concern. We
  // gate on requireAdmin above and patch a single jsonb column.
  const admin = getSupabaseAdmin().schema("hiring");
  const { data: ws } = await admin
    .from("workspaces")
    .select("company_status_config")
    .eq("id", workspaceId)
    .maybeSingle();

  const current =
    ws?.company_status_config && typeof ws.company_status_config === "object"
      ? (ws.company_status_config as Record<string, { label?: string; color?: string }>)
      : {};
  const entry = { ...(current[input.status] ?? {}) };

  if (input.label !== undefined) {
    const trimmed = input.label.trim();
    if (!trimmed) return { ok: false, error: "El nombre es obligatorio." };
    if (trimmed.length > 40) return { ok: false, error: "Máximo 40 caracteres." };
    entry.label = trimmed;
  }
  if (input.color !== undefined) {
    const c = (input.color ?? "").trim();
    if (c && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) {
      return { ok: false, error: "Color inválido." };
    }
    entry.color = c || undefined;
  }

  const next = { ...current, [input.status]: entry };
  const { error } = await admin
    .from("workspaces")
    .update({ company_status_config: next })
    .eq("id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath("/settings/job-statuses");
  revalidatePath("/companies");
  return { ok: true };
}

/**
 * Format check + reserved/taken/in-history check against the DB
 * function. Used by the slug editor on /settings/team to give live
 * feedback while the admin types. Cheap (one RPC call) and read-only
 * — no service-role needed.
 *
 * Returns one of:
 *   ok | invalid_format | reserved | taken | in_history | error
 */
export async function checkWorkspaceSlugAvailabilityAction(input: {
  candidate: string;
}): Promise<
  | { ok: true; status: "ok" | "invalid_format" | "reserved" | "taken" | "in_history" }
  | { ok: false; error: string }
> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const candidate = input.candidate.trim().toLowerCase();
  if (!candidate) return { ok: true, status: "invalid_format" };
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const { data, error } = await db.rpc("workspace_slug_check_availability", {
    candidate,
    current_workspace_id: workspaceId,
  });
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  const status = data as
    | "ok"
    | "invalid_format"
    | "reserved"
    | "taken"
    | "in_history";
  return { ok: true, status };
}

/**
 * Rename the workspace slug. Admin-only. The DB layer enforces
 * uniqueness + history archival (trigger inserts the old slug into
 * workspace_slug_history). We re-run the availability check inside
 * the same action to close the TOCTOU window between the typeahead
 * check and the actual UPDATE.
 *
 * Format rules (mirrored in the DB function so the DB stays the
 * source of truth):
 *   - 3 to 40 characters
 *   - [a-z0-9-], must start + end with [a-z0-9]
 *   - not in the reserved keyword list
 *   - not currently held by another workspace
 *   - not in another workspace's 30-day grace window
 */
export async function updateWorkspaceSlugAction(input: {
  slug: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const candidate = input.slug.trim().toLowerCase();
  const workspaceId = await getRequestWorkspaceId();

  const db = await hiring();
  const { data: status, error: checkErr } = await db.rpc(
    "workspace_slug_check_availability",
    { candidate, current_workspace_id: workspaceId },
  );
  if (checkErr) return { ok: false, error: checkErr.message.slice(0, 300) };
  if (status !== "ok") {
    const msg = {
      invalid_format:
        "Solo letras minúsculas, números y guiones. Entre 3 y 40 caracteres.",
      reserved: "Ese slug está reservado, escoge otro.",
      taken: "Ese slug ya está tomado por otra agencia.",
      in_history:
        "Ese slug perteneció a otra agencia hace menos de 30 días. Pruébalo después.",
    }[status as string];
    return { ok: false, error: msg ?? "No se puede usar ese slug." };
  }

  // SERVICE ROLE: slug rename — same reason as workspace name rename.
  // RLS limits UPDATE on workspaces to the owner, but slug rename is
  // an admin concern; the requireAdmin guard above + single-column
  // UPDATE keeps the blast radius tight. The AFTER UPDATE trigger
  // archives the old slug into workspace_slug_history for 301s.
  const admin = getSupabaseAdmin().schema("hiring");
  const { error } = await admin
    .from("workspaces")
    .update({ slug: candidate })
    .eq("id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath("/settings/team");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Patch the workspace's careers-site branding triad (accent color +
 * tagline). Logo upload has its own action below since it involves
 * file handling.
 *
 * Admin-only; routed through service-role for the same reason as
 * the name-rename — the underlying workspaces UPDATE RLS is owner-
 * gated.
 */
export async function updateWorkspaceBrandingAction(input: {
  accentColor?: string | null;
  careersTagline?: string | null;
  careersTheme?: "light" | "dark" | "system";
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;

  const patch: Record<string, unknown> = {};
  if (input.accentColor !== undefined) {
    const v = input.accentColor?.trim() || null;
    // Light validation: accept hex (#RGB / #RRGGBB) or null. Anything
    // else gets rejected so we don't paint the careers stripe with
    // unparseable CSS.
    if (v && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
      return { ok: false, error: "Color inválido (usa formato #RRGGBB)." };
    }
    patch.accent_color = v;
  }
  if (input.careersTagline !== undefined) {
    patch.careers_tagline = input.careersTagline?.trim() || null;
  }
  if (input.careersTheme !== undefined) {
    if (!["light", "dark", "system"].includes(input.careersTheme)) {
      return { ok: false, error: "Modo inválido." };
    }
    patch.careers_theme = input.careersTheme;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const workspaceId = await getRequestWorkspaceId();
  // SERVICE ROLE: workspace branding patch — RLS only allows owner
  // UPDATE on hiring.workspaces; branding is an admin-level concern.
  const admin = getSupabaseAdmin().schema("hiring");
  const { error } = await admin
    .from("workspaces")
    .update(patch)
    .eq("id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/careers");
  return { ok: true };
}

/**
 * Upload a workspace logo for the careers landing. Stored under the
 * shared `avatars` bucket (same path pattern as the personal profile
 * picture, but namespaced by workspace_id). Public read; service-
 * role write because the upload itself doesn't have a user-folder
 * for RLS to match against.
 */
const WORKSPACE_LOGO_ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);

/**
 * Logo upload, variant-aware. `formData.variant` selects which column
 * the URL writes back to:
 *   - 'light' (default) → workspaces.logo_url      — shown on light bg
 *   - 'dark'            → workspaces.logo_url_dark — shown on dark bg
 *
 * Storage path includes the variant so concurrent uploads of the two
 * variants don't collide on the same filename.
 */
export async function uploadWorkspaceLogoAction(
  formData: FormData,
): Promise<ActionResult<{ logoUrl: string; variant: "light" | "dark" }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: "El logo excede 2 MB." };
  }
  if (!WORKSPACE_LOGO_ALLOWED_MIMES.has(file.type)) {
    return { ok: false, error: "Formato no soportado (PNG, JPG, WebP o SVG)." };
  }
  const variantRaw = formData.get("variant");
  const variant: "light" | "dark" =
    variantRaw === "dark" ? "dark" : "light";

  const workspaceId = await getRequestWorkspaceId();
  const ext =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "png";
  const path = `workspaces/${workspaceId}/logo-${variant}-${Date.now()}.${ext}`;

  // SERVICE ROLE: workspace logo upload — the `avatars` bucket's
  // INSERT policy is keyed on user folders (auth.uid), not workspace
  // ids. Service role bypasses RLS so the workspace prefix is valid;
  // the file lands in the same public bucket so the careers anon
  // client can read it.
  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message.slice(0, 300) };

  const {
    data: { publicUrl },
  } = admin.storage.from("avatars").getPublicUrl(path);

  const column = variant === "dark" ? "logo_url_dark" : "logo_url";
  const { error: dbErr } = await admin
    .schema("hiring")
    .from("workspaces")
    .update({ [column]: publicUrl })
    .eq("id", workspaceId);
  if (dbErr) return { ok: false, error: dbErr.message.slice(0, 300) };

  revalidatePath("/settings/careers");
  return { ok: true, data: { logoUrl: publicUrl, variant } };
}

export async function removeWorkspaceLogoAction(input?: {
  variant?: "light" | "dark";
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const variant = input?.variant === "dark" ? "dark" : "light";
  const column = variant === "dark" ? "logo_url_dark" : "logo_url";
  const workspaceId = await getRequestWorkspaceId();
  const admin = getSupabaseAdmin().schema("hiring");
  const { error } = await admin
    .from("workspaces")
    .update({ [column]: null })
    .eq("id", workspaceId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/careers");
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
  /** When true, the field is rendered on the public posting page. */
  showInPostings?: boolean;
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
      show_in_postings: input.showInPostings ?? false,
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
  showInPostings?: boolean;
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
  if (input.showInPostings !== undefined) {
    patch.show_in_postings = input.showInPostings;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nada que actualizar" };
  }

  const db = await hiring();
  const { data: existing, error: readErr } = await db
    .from("custom_field_definitions")
    .select("entity_type, is_system")
    .eq("id", input.id)
    .maybeSingle();
  if (readErr || !existing) return { ok: false, error: "Campo no encontrado" };

  // System-managed fields (role_type, assessment_link) lock their key
  // + kind + options because the AI pipeline reads them by canonical
  // contract. Label / description / required / filterable / visible /
  // show_in_postings stay editable so admins can still rename or
  // re-flag them.
  if (existing.is_system) {
    delete patch.kind;
    delete patch.options;
  }

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
    .select("entity_type, is_system")
    .eq("id", id)
    .maybeSingle();
  if (existing?.is_system) {
    return {
      ok: false,
      error:
        "Este campo lo usa el sistema (Kickoff / Calibrar) y no se puede eliminar.",
    };
  }
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

  // Resolve workspace_id + entity_type + key from the definition.
  // We also need the key to recognize the two system-managed jobs
  // role-config fields (role_type, assessment_link) so writes can
  // be mirrored to their legacy columns.
  const { data: def, error: defErr } = await db
    .from("custom_field_definitions")
    .select("workspace_id, entity_type, key, is_system")
    .eq("id", input.definitionId)
    .maybeSingle();
  if (defErr || !def) {
    return { ok: false, error: "Definición no encontrada" };
  }

  const isJob = def.entity_type === "job";
  const key = def.key as string;
  const mirroredToJobColumn =
    isJob && (key === "role_type" || key === "assessment_link");

  if (isEmpty(input.value)) {
    const { error } = await db
      .from("custom_field_values")
      .delete()
      .eq("definition_id", input.definitionId)
      .eq("entity_id", input.entityId);
    if (error) return { ok: false, error: error.message.slice(0, 300) };

    // Mirror clear → null on the legacy column so AI flows that
    // still read job.role_type / job.assessment_link see the right
    // state.
    if (mirroredToJobColumn) {
      await db
        .from("jobs")
        .update({ [key]: null })
        .eq("id", input.entityId);
    }
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

  // Mirror to the legacy job column. The value coming in is `unknown`
  // because the same action handles every field type, but for the two
  // system fields we expect strings (role_type enum value, or a URL).
  if (mirroredToJobColumn) {
    const mirror =
      typeof input.value === "string" ? input.value.trim() : null;
    if (mirror) {
      await db
        .from("jobs")
        .update({ [key]: mirror })
        .eq("id", input.entityId);
    }
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

// Allowed values for the role_type enum (mirrored from the hiring
// schema). We re-validate here so a malformed UI payload can't sneak
// past the column check constraint.
const ROLE_TYPES = [
  "full_headhunting",
  "hybrid_ai_hunting",
  "inbound_ai_driven",
] as const;
type RoleTypeValue = (typeof ROLE_TYPES)[number];

export async function createProcessTemplateAction(input: {
  name: string;
  description?: string | null;
  isDefault?: boolean;
  autoMoveContactedOnOutbound?: boolean;
  autoMoveAnsweredOnReply?: boolean;
  roleType?: RoleTypeValue;
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
      // role_type drives which kickoff prompt + which sections of the
      // AI package the vacante gets. Defaults to full_headhunting so
      // an admin can create a template before deciding the engagement
      // model — matches the column default.
      role_type:
        input.roleType && ROLE_TYPES.includes(input.roleType)
          ? input.roleType
          : "full_headhunting",
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
  roleType?: RoleTypeValue;
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
  if (input.roleType !== undefined) {
    if (!ROLE_TYPES.includes(input.roleType)) {
      return { ok: false, error: "Tipo de rol inválido." };
    }
    patch.role_type = input.roleType;
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

  // Cascade role_type onto every vacante using this template. Without
  // this the per-job denormalized `jobs.role_type` cache would drift
  // and kickoffs would behave inconsistently. Safe: writers across
  // the app treat the column as derived from the template now.
  if (input.roleType !== undefined) {
    await db
      .from("jobs")
      .update({ role_type: input.roleType })
      .eq("process_template_id", input.id);
    revalidatePath("/jobs");
  }

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

// =====================================================
// Template ↔ per-job pipeline propagation helpers.
//
// jobs.process_template_id remembers which template a vacante was
// spawned from; pipeline_stages.template_stage_id remembers which
// template stage each per-job stage was cloned from. Together they
// let template edits propagate into existing vacantes without
// breaking jobs that opted out (no template, or already closed).
//
// Propagation scope: every vacante whose status row is NOT flagged
// is_archived. Workspace-defined statuses now control what counts
// as "live"; admins can rename / add / mark archived freely in
// /settings/job-statuses without us chasing this code path.
// =====================================================

type HiringDb = Awaited<ReturnType<typeof hiring>>;

async function eligibleJobIdsForTemplate(
  db: HiringDb,
  templateId: string,
): Promise<Array<{ id: string; workspace_id: string }>> {
  // Join job_statuses and filter on is_archived=false at the DB. The
  // !inner hint forces an inner join so rows without a status_id
  // (shouldn't exist post-migration but defensive) don't sneak in.
  const { data } = await db
    .from("jobs")
    .select("id, workspace_id, status:job_statuses!inner(is_archived)")
    .eq("process_template_id", templateId)
    .eq("status.is_archived", false);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    workspace_id: r.workspace_id as string,
  }));
}

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

  // Propagate to live vacantes: shift every per-job stage's position
  // by +1 (mirroring the template shift above) and insert a new
  // pipeline_stage linked to this template_stage_id. The kanban will
  // pick up the new stage on the next render with zero candidates in
  // it — same intent as opening a brand-new vacante with this
  // template.
  const eligibleJobs = await eligibleJobIdsForTemplate(db, input.templateId);
  if (eligibleJobs.length > 0) {
    const jobIds = eligibleJobs.map((j) => j.id);
    const { data: jobStages } = await db
      .from("pipeline_stages")
      .select("id, position")
      .in("job_id", jobIds);
    for (const s of jobStages ?? []) {
      await db
        .from("pipeline_stages")
        .update({ position: (s.position as number) + 1 })
        .eq("id", s.id as string);
    }
    await db.from("pipeline_stages").insert(
      eligibleJobs.map((j) => ({
        workspace_id: j.workspace_id,
        job_id: j.id,
        template_stage_id: data.id as string,
        name,
        category: input.category,
        color: sanitizeHexColor(input.color),
        position: 0,
        client_portal_visible: Boolean(input.clientPortalVisible),
      })),
    );
    for (const j of eligibleJobs) revalidatePath(`/jobs/${j.id}`);
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

  // Mirror the same fields on every per-job stage cloned from this
  // template stage. Position deliberately isn't in `patch` (this
  // action only edits name/category/color/visibility — reorders are
  // their own action), so the per-job ordering stays consistent.
  if (Object.keys(patch).length > 0) {
    const eligibleJobs = await eligibleJobIdsForTemplate(db, input.templateId);
    if (eligibleJobs.length > 0) {
      await db
        .from("pipeline_stages")
        .update(patch)
        .eq("template_stage_id", input.id)
        .in(
          "job_id",
          eligibleJobs.map((j) => j.id),
        );
      for (const j of eligibleJobs) revalidatePath(`/jobs/${j.id}`);
    }
  }

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

  // Block delete when any candidate is currently sitting in a per-job
  // stage cloned from this template stage (only counting active /
  // borrador / por_cerrar vacantes). Cubierta / cancelada keep their
  // historical snapshot, so candidates frozen in there don't block.
  const eligibleJobs = await eligibleJobIdsForTemplate(db, input.templateId);
  let perJobStageIds: string[] = [];
  if (eligibleJobs.length > 0) {
    const { data: stages } = await db
      .from("pipeline_stages")
      .select("id")
      .eq("template_stage_id", input.id)
      .in(
        "job_id",
        eligibleJobs.map((j) => j.id),
      );
    perJobStageIds = (stages ?? []).map((s) => s.id as string);
    if (perJobStageIds.length > 0) {
      const { count } = await db
        .from("applications")
        .select("id", { head: true, count: "exact" })
        .in("stage_id", perJobStageIds);
      if ((count ?? 0) > 0) {
        return {
          ok: false,
          error: `No se puede borrar — hay ${count} candidato${(count ?? 0) === 1 ? "" : "s"} en esta etapa en vacantes activas. Muévelos primero.`,
        };
      }
    }
  }

  // Safe to delete: drop the per-job clones first (the FK is SET
  // NULL, but we don't want orphan stages lingering in active
  // pipelines), then the template stage itself.
  if (perJobStageIds.length > 0) {
    await db.from("pipeline_stages").delete().in("id", perJobStageIds);
    for (const j of eligibleJobs) revalidatePath(`/jobs/${j.id}`);
  }
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

  // Propagate the new order to every per-job stage cloned from this
  // template. We key on template_stage_id so per-job customizations
  // (if any are ever added) are scoped to position-only here.
  const eligibleJobs = await eligibleJobIdsForTemplate(db, input.templateId);
  if (eligibleJobs.length > 0) {
    const jobIds = eligibleJobs.map((j) => j.id);
    for (let i = 0; i < input.orderedIds.length; i++) {
      await db
        .from("pipeline_stages")
        .update({ position: i })
        .eq("template_stage_id", input.orderedIds[i])
        .in("job_id", jobIds);
    }
    for (const j of eligibleJobs) revalidatePath(`/jobs/${j.id}`);
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

// =====================================================
// Workspace job statuses (admin-only). UI lives at
// /settings/job-statuses; behavior gates (is_open / is_archived)
// drive lifecycle semantics across the app (careers visibility,
// template propagation scope, etc).
// =====================================================

function isHexColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

function sanitizeHexOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return isHexColor(t) ? t : null;
}

/**
 * Behavior categories a custom status can attach to. Each maps to a
 * fixed (is_open, is_archived, is_filled) triple that the system
 * rows already occupy. Custom rows just split a behavior bucket
 * into sub-statuses (e.g. two open rows: "Activa" and "En revisión").
 */
type CustomStatusBehavior =
  | "draft"
  | "open"
  | "closed_won"
  | "closed_lost";

const BEHAVIOR_FLAGS: Record<
  CustomStatusBehavior,
  { is_open: boolean; is_archived: boolean; is_filled: boolean }
> = {
  draft: { is_open: false, is_archived: false, is_filled: false },
  open: { is_open: true, is_archived: false, is_filled: false },
  closed_won: { is_open: false, is_archived: true, is_filled: true },
  closed_lost: { is_open: false, is_archived: true, is_filled: false },
};

/**
 * Create a new workspace job status. The caller picks a behavior
 * from the four canonical categories; we set the flag triple from
 * that mapping (admin can't invent new behaviors because reports
 * key on the triple). Position is appended to the end so other
 * rows don't shift.
 *
 * is_system stays false (DB default), which means the row is
 * deletable when no jobs use it.
 */
export async function createWorkspaceJobStatusAction(input: {
  label: string;
  color?: string | null;
  behavior: CustomStatusBehavior;
}): Promise<ActionResult<{ id: string }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const label = input.label.trim();
  if (!label) return { ok: false, error: "El nombre es obligatorio." };
  if (label.length > 40) {
    return { ok: false, error: "Máximo 40 caracteres." };
  }
  const workspaceId = await getRequestWorkspaceId();

  const db = await hiring();
  // Slug-ish key for new rows. Derived from the label so future
  // lookups by key (the lib helpers fall back here when key='borrador'
  // etc has been renamed) at least have a chance to find something
  // sensible. Custom rows get an `x_` prefix so they can never
  // collide with future system seeds.
  const baseKey =
    "x_" +
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30);

  // Position = current max + 10 so manual reorders have headroom.
  const { data: maxRow } = await db
    .from("job_statuses")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | undefined) ?? 0) + 10;

  // Insure unique key inside this workspace by appending a counter
  // when a collision would occur. The DB unique constraint backs
  // this up; we just give it a clean name.
  let key = baseKey || "x_custom";
  let suffix = 1;
  while (true) {
    const { data: clash } = await db
      .from("job_statuses")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("key", key)
      .maybeSingle();
    if (!clash) break;
    suffix += 1;
    key = `${baseKey}_${suffix}`;
  }

  const flags = BEHAVIOR_FLAGS[input.behavior];
  if (!flags) {
    return { ok: false, error: "Comportamiento inválido." };
  }

  const { data, error } = await db
    .from("job_statuses")
    .insert({
      workspace_id: workspaceId,
      key,
      label,
      color: sanitizeHexOrNull(input.color) ?? "#94a3b8",
      position: nextPosition,
      ...flags,
      is_system: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message.slice(0, 300) || "No se pudo crear" };
  }
  revalidatePath("/settings/job-statuses");
  revalidatePath("/jobs");
  return { ok: true, data: { id: data.id as string } };
}

/**
 * Patch an existing job status. The behavior triple (is_open /
 * is_archived / is_filled) is immutable for every row — it was
 * either seeded (system rows) or picked at create time (custom
 * rows). Changing it after the fact would silently move jobs
 * between report buckets, which is a metrics-integrity footgun.
 *
 * System rows are extra-locked: ONLY the label can change. The
 * admin can rename "Activa" to "En búsqueda" if they want, but the
 * color and behavior stay as-seeded so the platform's lookup
 * helpers (resolveDefaultJobStatusId, careers filters, etc.) can
 * rely on the originals.
 *
 * Custom rows allow label + color edits.
 */
export async function updateWorkspaceJobStatusAction(input: {
  id: string;
  label?: string;
  color?: string | null;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;

  // Look up the target row first so we can gate by is_system.
  const db = await hiring();
  const { data: row } = await db
    .from("job_statuses")
    .select("id, is_system")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Estado no encontrado" };
  const isSystem = row.is_system === true;

  const patch: Record<string, unknown> = {};
  if (typeof input.label === "string") {
    const trimmed = input.label.trim();
    if (!trimmed) return { ok: false, error: "El nombre es obligatorio." };
    if (trimmed.length > 40) {
      return { ok: false, error: "Máximo 40 caracteres." };
    }
    patch.label = trimmed;
  }
  if (input.color !== undefined) {
    if (isSystem) {
      return {
        ok: false,
        error: "Los estados del sistema solo pueden cambiar de nombre.",
      };
    }
    patch.color = sanitizeHexOrNull(input.color);
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await db
    .from("job_statuses")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath("/settings/job-statuses");
  revalidatePath("/jobs");
  return { ok: true };
}

/**
 * Delete a workspace job status. Two guardrails:
 *   - is_system rows are not deletable (the platform falls back to
 *     them in lib helpers; deleting would orphan future code paths).
 *   - rows in active use (any job has status_id = this) block
 *     deletion. The admin has to move those jobs to a different
 *     status first.
 */
export async function deleteWorkspaceJobStatusAction(input: {
  id: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { data: row } = await db
    .from("job_statuses")
    .select("id, is_system")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Estado no encontrado" };
  if (row.is_system === true) {
    return {
      ok: false,
      error:
        "Los estados de sistema no se pueden eliminar — sólo renombrar o editar.",
    };
  }
  const { count } = await db
    .from("jobs")
    .select("id", { head: true, count: "exact" })
    .eq("status_id", input.id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `No se puede eliminar — ${count} vacante${(count ?? 0) === 1 ? " usa" : "s usan"} este estado. Muévelas primero.`,
    };
  }
  const { error } = await db.from("job_statuses").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/job-statuses");
  revalidatePath("/jobs");
  return { ok: true };
}

/**
 * Reorder workspace job statuses. Caller supplies the new
 * head-to-tail order; we rewrite each row's position so the
 * sorted-by-position view matches it.
 */
export async function reorderWorkspaceJobStatusesAction(input: {
  orderedIds: string[];
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  for (let i = 0; i < input.orderedIds.length; i++) {
    const { error } = await db
      .from("job_statuses")
      .update({ position: i * 10 })
      .eq("id", input.orderedIds[i]);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  }
  revalidatePath("/settings/job-statuses");
  revalidatePath("/jobs");
  return { ok: true };
}
