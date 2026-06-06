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
import { isPromptCategory } from "@/lib/prompts/categories";
import { requireAdmin } from "@/lib/auth/team";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_MASTER_PROMPT } from "@/lib/kickoff/default-master-prompt";
import { isEntityType } from "./_lib/entities";
import { getT } from "@/lib/i18n/server";

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
  const t = await getT();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t("errors.selectImage") };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: t("errors.imageExceeds5mb") };
  }
  if (!AVATAR_ALLOWED_MIMES.has(file.type)) {
    return {
      ok: false,
      error: t("errors.unsupportedImageFormat"),
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
  const t = await getT();
  const trimmed = input.fullName.trim();
  if (!trimmed) return { ok: false, error: t("errors.nameEmpty") };
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
  const t = await getT();
  const trimmed = input.name.trim();
  if (!trimmed) return { ok: false, error: t("errors.nameEmpty") };
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

// ============================================================
// Company statuses (workspace-scoped, hiring.company_statuses).
//
// Mirrors the job-status manager but with NO behavior/funnel flags and
// NO system lock: company statuses are fully editable — any row can be
// renamed, recolored, reordered, or deleted. The only guards are
// "can't delete a status while companies still use it" and "can't
// delete the last remaining status" (a workspace always needs ≥1 so
// new companies have something to be assigned). Writes go through the
// auth'd client; RLS gates them to workspace admins.
// ============================================================

/** Slug key for a new company status. Prefixed `x_` so it can never
 *  collide with the seeded keys (client/prospect/partner/none) or a
 *  future system seed. Uniqueness per workspace is ensured by the
 *  caller (and backed by the UNIQUE(workspace_id, key) constraint). */
function companyStatusKeyFromLabel(label: string): string {
  const base =
    "x_" +
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30);
  return base === "x_" ? "x_custom" : base;
}

export async function createWorkspaceCompanyStatusAction(input: {
  label: string;
  color?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const t = await getT();
  const label = input.label.trim();
  if (!label) return { ok: false, error: t("errors.nameRequired") };
  if (label.length > 40) return { ok: false, error: t("errors.max40Chars") };
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Position = current max + 10 so reorders have headroom.
  const { data: maxRow } = await db
    .from("company_statuses")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | undefined) ?? 0) + 10;

  // Ensure a unique key within the workspace.
  const baseKey = companyStatusKeyFromLabel(label);
  let key = baseKey;
  let suffix = 1;
  while (true) {
    const { data: clash } = await db
      .from("company_statuses")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("key", key)
      .maybeSingle();
    if (!clash) break;
    suffix += 1;
    key = `${baseKey}_${suffix}`;
  }

  const { data, error } = await db
    .from("company_statuses")
    .insert({
      workspace_id: workspaceId,
      key,
      label,
      color: sanitizeHexOrNull(input.color) ?? "#94a3b8",
      position: nextPosition,
      is_system: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message.slice(0, 300) || t("errors.createFailed") };
  }
  revalidatePath("/settings/job-statuses");
  revalidatePath("/companies");
  return { ok: true, data: { id: data.id as string } };
}

/** Patch a company status. Both label AND color are editable on every
 *  row (unlike job statuses, company statuses have no system lock). */
export async function updateWorkspaceCompanyStatusAction(input: {
  id: string;
  label?: string;
  color?: string | null;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();

  const patch: Record<string, unknown> = {};
  if (typeof input.label === "string") {
    const t = await getT();
    const trimmed = input.label.trim();
    if (!trimmed) return { ok: false, error: t("errors.nameRequired") };
    if (trimmed.length > 40) return { ok: false, error: t("errors.max40Chars") };
    patch.label = trimmed;
  }
  if (input.color !== undefined) {
    patch.color = sanitizeHexOrNull(input.color);
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await db
    .from("company_statuses")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath("/settings/job-statuses");
  revalidatePath("/companies");
  return { ok: true };
}

/**
 * Delete a company status. Fully editable, so no system lock — but two
 * guards keep the data consistent:
 *   - rows in active use (any company has status = this key) block
 *     deletion; the admin reassigns those companies first. (The FK's
 *     ON DELETE RESTRICT backs this up at the DB level.)
 *   - the last remaining status can't be deleted — a workspace always
 *     needs at least one so new companies can be classified.
 */
export async function deleteWorkspaceCompanyStatusAction(input: {
  id: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const t = await getT();
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: row } = await db
    .from("company_statuses")
    .select("id, key")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { ok: false, error: t("errors.statusNotFound") };

  const { count: total } = await db
    .from("company_statuses")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId);
  if ((total ?? 0) <= 1) {
    return {
      ok: false,
      error: t("errors.cannotDeleteLastStatus"),
    };
  }

  const { count: inUse } = await db
    .from("companies")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("status", row.key as string);
  if ((inUse ?? 0) > 0) {
    return {
      ok: false,
      error:
        (inUse ?? 0) === 1
          ? t("errors.statusInUseCompanyOne", { inUse: inUse ?? 0 })
          : t("errors.statusInUseCompanyMany", { inUse: inUse ?? 0 }),
    };
  }

  const { error } = await db.from("company_statuses").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/job-statuses");
  revalidatePath("/companies");
  return { ok: true };
}

export async function reorderWorkspaceCompanyStatusesAction(input: {
  orderedIds: string[];
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  for (let i = 0; i < input.orderedIds.length; i++) {
    const { error } = await db
      .from("company_statuses")
      .update({ position: i * 10 })
      .eq("id", input.orderedIds[i]);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
  }
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
    const t = await getT();
    const msg = {
      invalid_format: t("errors.slugInvalidFormat"),
      reserved: t("errors.slugReserved"),
      taken: t("errors.slugTaken"),
      in_history: t("errors.slugInHistory"),
    }[status as string];
    return { ok: false, error: msg ?? t("errors.slugCannotUse") };
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
      const t = await getT();
      return { ok: false, error: t("errors.invalidColor") };
    }
    patch.accent_color = v;
  }
  if (input.careersTagline !== undefined) {
    patch.careers_tagline = input.careersTagline?.trim() || null;
  }
  if (input.careersTheme !== undefined) {
    if (!["light", "dark", "system"].includes(input.careersTheme)) {
      const t = await getT();
      return { ok: false, error: t("errors.invalidMode") };
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
  const t = await getT();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t("errors.selectImage") };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: t("errors.logoExceeds2mb") };
  }
  if (!WORKSPACE_LOGO_ALLOWED_MIMES.has(file.type)) {
    return { ok: false, error: t("errors.unsupportedLogoFormat") };
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

type StoredOption = { value: string; color: string | null };

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function sanitizeOptionColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return HEX_RE.test(t) ? t : null;
}

function normalizeOptions(
  kind: CustomFieldKind,
  raw: unknown,
): StoredOption[] | null {
  if (kind !== "select" && kind !== "multi_select") return null;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StoredOption[] = [];
  for (const v of raw) {
    let value = "";
    let color: string | null = null;
    if (typeof v === "string") {
      value = v.trim();
    } else if (v && typeof v === "object") {
      const obj = v as { value?: unknown; color?: unknown };
      if (typeof obj.value === "string") value = obj.value.trim();
      color = sanitizeOptionColor(obj.color);
    }
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, color });
  }
  return out;
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
  /** When true, the field is sent to the client portal viewer. */
  isVisibleInPortal?: boolean;
  options?: Array<string | { value: string; color?: string | null }>;
}): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;

  const t = await getT();
  const label = input.label.trim();
  const key = input.key.trim();
  if (!label) return { ok: false, error: t("errors.labelRequired") };
  if (!key) return { ok: false, error: t("errors.keyRequired") };
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return {
      ok: false,
      error: t("errors.keyFormat"),
    };
  }
  if (!isEntityType(input.entityType)) {
    return { ok: false, error: t("errors.invalidEntity") };
  }
  if (!isKind(input.kind)) {
    return { ok: false, error: t("errors.invalidFieldType") };
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
      is_visible_in_portal: input.isVisibleInPortal ?? false,
      options: normalizeOptions(input.kind as CustomFieldKind, input.options),
      position: nextPosition,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: t("errors.customFieldKeyExists"),
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
  isVisibleInPortal?: boolean;
  options?: Array<string | { value: string; color?: string | null }>;
}): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const tr = await getT();
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) {
    const t = input.label.trim();
    if (!t) return { ok: false, error: tr("errors.labelRequired") };
    patch.label = t;
  }
  if (input.kind !== undefined) {
    if (!isKind(input.kind)) {
      return { ok: false, error: tr("errors.invalidFieldType") };
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
  if (input.isVisibleInPortal !== undefined) {
    patch.is_visible_in_portal = input.isVisibleInPortal;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: tr("errors.nothingToUpdate") };
  }

  const db = await hiring();
  const { data: existing, error: readErr } = await db
    .from("custom_field_definitions")
    .select("entity_type, is_system")
    .eq("id", input.id)
    .maybeSingle();
  if (readErr || !existing) return { ok: false, error: tr("errors.fieldNotFound") };

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
    const t = await getT();
    return {
      ok: false,
      error: t("errors.customFieldSystemLocked"),
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
    const t = await getT();
    return { ok: false, error: t("errors.definitionNotFound") };
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

/**
 * Bulk-write one custom field value across many entities. Same shape
 * as upsertCustomFieldValueAction but loops over `entityIds`: empty
 * value → delete every row for the (def, ids) combo; non-empty →
 * upsert one row per entity. The legacy job-column mirror runs the
 * same way the single-value variant does, so `role_type` /
 * `assessment_link` stay in sync with the AI flows that read them.
 *
 * Returns the count of entities actually written so the toast can
 * say "5 vacantes actualizadas".
 */
export async function bulkUpdateCustomFieldValueAction(input: {
  definitionId: string;
  entityIds: string[];
  value: unknown;
}): Promise<ActionResult<{ updated: number }>> {
  const g = await guard();
  if (!g.ok) return g;
  if (input.entityIds.length === 0) return { ok: true, data: { updated: 0 } };

  const db = await hiring();
  const { data: def, error: defErr } = await db
    .from("custom_field_definitions")
    .select("workspace_id, entity_type, key")
    .eq("id", input.definitionId)
    .maybeSingle();
  if (defErr || !def) {
    const t = await getT();
    return { ok: false, error: t("errors.definitionNotFound") };
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
      .in("entity_id", input.entityIds);
    if (error) return { ok: false, error: error.message.slice(0, 300) };
    if (mirroredToJobColumn) {
      await db
        .from("jobs")
        .update({ [key]: null })
        .in("id", input.entityIds);
    }
    return { ok: true, data: { updated: input.entityIds.length } };
  }

  const payload = input.entityIds.map((entityId) => ({
    workspace_id: def.workspace_id as string,
    definition_id: input.definitionId,
    entity_type: def.entity_type as string,
    entity_id: entityId,
    value: input.value as never,
  }));
  const { error } = await db
    .from("custom_field_values")
    .upsert(payload, { onConflict: "definition_id,entity_id" });
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  if (mirroredToJobColumn) {
    const mirror =
      typeof input.value === "string" ? input.value.trim() : null;
    if (mirror) {
      await db
        .from("jobs")
        .update({ [key]: mirror })
        .in("id", input.entityIds);
    }
  }
  return { ok: true, data: { updated: input.entityIds.length } };
}

export async function reorderCustomFieldsAction(input: {
  entityType: string;
  orderedIds: string[];
}): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  if (!isEntityType(input.entityType)) {
    const t = await getT();
    return { ok: false, error: t("errors.invalidEntity") };
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
  const t = await getT();

  const name = input.name.trim();
  if (!name) return { ok: false, error: t("errors.nameRequired") };

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
    return { ok: false, error: error?.message.slice(0, 300) || t("errors.createFailed") };
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
  const t = await getT();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.name === "string") {
    const trimmed = input.name.trim();
    if (!trimmed) return { ok: false, error: t("errors.nameRequired") };
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
        error: t("errors.cannotUnsetOnlyProcess"),
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
  const t = await getT();
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data: src, error: srcErr } = await db
    .from("process_templates")
    .select("name, description")
    .eq("id", input.id)
    .maybeSingle();
  if (srcErr || !src) {
    return { ok: false, error: srcErr?.message || t("errors.templateNotFound") };
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
    return { ok: false, error: copyErr?.message.slice(0, 300) || t("errors.duplicateFailed") };
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
    const t = await getT();
    return {
      ok: false,
      error: t("errors.cannotDeleteDefaultProcess"),
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
    const t = await getT();
    return { ok: false, error: tplRes.error?.message || t("errors.notFound") };
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
  const t = await getT();
  const name = input.name.trim();
  if (!name) return { ok: false, error: t("errors.nameRequired") };
  if (!isPipelineCategory(input.category)) {
    return { ok: false, error: t("errors.invalidCategory") };
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
    return { ok: false, error: error?.message.slice(0, 300) || t("errors.createFailed") };
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
  const t = await getT();
  const patch: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const trimmed = input.name.trim();
    if (!trimmed) return { ok: false, error: t("errors.nameRequired") };
    patch.name = trimmed;
  }
  if (typeof input.category === "string") {
    if (!isPipelineCategory(input.category)) {
      return { ok: false, error: t("errors.invalidCategory") };
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
  const t = await getT();
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
          error:
            (count ?? 0) === 1
              ? t("errors.stageHasCandidatesOne", { count: count ?? 0 })
              : t("errors.stageHasCandidatesMany", { count: count ?? 0 }),
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
    model: "claude-opus-4-8",
  },
};

async function ownerGuard(): Promise<
  | { ok: true; workspaceId: string; teamMemberId: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  if (user.team_member.team_role !== "owner") {
    const t = await getT();
    return { ok: false, error: t("errors.ownerOnlyPrompts") };
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
  if (!def) {
    const t = await getT();
    return { ok: false, error: t("errors.promptNotRecognized", { key }) };
  }

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
    const t = await getT();
    return { ok: false, error: error?.message || t("errors.promptCreateFailed") };
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
    const t = await getT();
    return { ok: false, error: t("errors.bodyEmpty") };
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

/**
 * Calibrate a prompt with a prompt. Same UX shape as
 * calibrateSectionAction (Paquete sections) but operates on the
 * full prompt body instead of one section. Returns the rewritten
 * text — the editor swaps it into the textarea so the recruiter
 * can review before hitting Save.
 */
export async function calibratePromptAction(input: {
  promptId: string;
  currentBody: string;
  userPrompt: string;
}): Promise<ActionResult<{ body: string }>> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;
  const instruction = input.userPrompt.trim();
  if (!instruction) return { ok: false, error: "Empty prompt" };
  if (!input.currentBody.trim()) {
    return { ok: false, error: "Prompt body is empty" };
  }
  const { anthropicClient } = await import("@/lib/ai/anthropic-client");
  const client = anthropicClient();
  const system = `You rewrite system prompts. The user gives you a CURRENT PROMPT and an INSTRUCTION describing how it should change. Apply ONLY the instructed change and return the entire updated prompt — preserve all sections, structure, headings, examples, and rules that were not asked to change. Do not add commentary, do not wrap the result in code fences. Return the prompt body verbatim, ready to paste in.`;
  const userMessage = [
    "CURRENT PROMPT (verbatim):",
    "---",
    input.currentBody,
    "---",
    "",
    "INSTRUCTION:",
    instruction,
    "",
    "Return the updated prompt body. Plain text. No code fences. No preamble.",
  ].join("\n");
  let response;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `AI call failed: ${msg.slice(0, 300)}` };
  }
  const block = response.content.find((c) => c.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!block?.text) {
    return { ok: false, error: "AI returned empty body" };
  }
  // Strip accidental code-fence wrapping just in case.
  let body = block.text.trim();
  if (body.startsWith("```")) {
    body = body.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  void input.promptId; // promptId is included for future logging/usage
  return { ok: true, data: { body } };
}

/**
 * Restore a prompt to a specific saved version. Writes the version's
 * body + model back onto the prompts row — the existing snapshot
 * trigger will capture the pre-restore state as a new version, so
 * the restore itself is reversible.
 */
export async function restorePromptVersionAction(input: {
  promptId: string;
  versionId: string;
}): Promise<ActionResult> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;
  const db = await hiring();
  const { data: ver, error: verErr } = await db
    .from("prompt_versions")
    .select("body, model, prompt_id")
    .eq("id", input.versionId)
    .maybeSingle();
  if (verErr) return { ok: false, error: verErr.message.slice(0, 300) };
  if (!ver) return { ok: false, error: "Version not found" };
  if (ver.prompt_id !== input.promptId) {
    return { ok: false, error: "Version does not belong to this prompt" };
  }
  const { error } = await db
    .from("prompts")
    .update({
      body: ver.body,
      model: ver.model,
      updated_by: guardResult.teamMemberId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.promptId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/settings/prompts");
  revalidatePath(`/settings/prompts/${input.promptId}`);
  return { ok: true };
}

export async function createPromptAction(input: {
  key: string;
  label: string;
  body: string;
  model: string;
  category?: string;
}): Promise<ActionResult<{ id: string }>> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;

  const key = input.key.trim();
  const label = input.label.trim();
  const body = input.body;
  const model = input.model.trim();
  const category = input.category?.trim() || "kickoff";
  const t = await getT();
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return {
      ok: false,
      error: t("errors.keyFormat"),
    };
  }
  if (!isPromptCategory(category)) {
    return { ok: false, error: t("errors.invalidCategory") };
  }
  if (!label) return { ok: false, error: t("errors.labelRequiredAlt") };
  if (!body.trim()) return { ok: false, error: t("errors.bodyRequired") };
  if (!model) return { ok: false, error: t("errors.modelRequired") };

  const db = await hiring();
  // First prompt in a category becomes its default automatically.
  const { count } = await db
    .from("prompts")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", guardResult.workspaceId)
    .eq("category", category);
  const isFirst = (count ?? 0) === 0;

  const { data, error } = await db
    .from("prompts")
    .insert({
      workspace_id: guardResult.workspaceId,
      key,
      label,
      body,
      model,
      category,
      is_default: isFirst,
      updated_by: guardResult.teamMemberId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: t("errors.promptKeyExists") };
    }
    return { ok: false, error: error?.message || t("errors.promptCreateFailed") };
  }
  revalidatePath("/settings/prompts");
  return { ok: true, data: { id: data.id as string } };
}

/** Make a prompt the default for its category (one default per
 *  workspace+category, enforced by a partial unique index). */
export async function setDefaultPromptAction(input: {
  promptId: string;
}): Promise<ActionResult> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;
  const db = await hiring();

  const { data: row } = await db
    .from("prompts")
    .select("id, category")
    .eq("id", input.promptId)
    .maybeSingle();
  if (!row) {
    const t = await getT();
    return { ok: false, error: t("errors.promptNotFound") };
  }

  // Clear the current default in this category first (the partial
  // unique index would reject two defaults mid-update otherwise).
  await db
    .from("prompts")
    .update({ is_default: false })
    .eq("workspace_id", guardResult.workspaceId)
    .eq("category", row.category as string)
    .eq("is_default", true);
  const { error } = await db
    .from("prompts")
    .update({ is_default: true })
    .eq("id", input.promptId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };

  revalidatePath("/settings/prompts");
  return { ok: true };
}

export async function deletePromptAction(input: {
  promptId: string;
  key: string;
}): Promise<ActionResult> {
  const guardResult = await ownerGuard();
  if (!guardResult.ok) return guardResult;
  // Don't allow deleting prompts that the product depends on.
  if (input.key === "kickoff_master") {
    const t = await getT();
    return {
      ok: false,
      error: t("errors.promptRequiredByProduct"),
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
  if (!def) {
    const t = await getT();
    return { ok: false, error: t("errors.promptNotRecognized", { key: input.key }) };
  }

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
  const t = await getT();

  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: t("errors.invalidEmail") };
  }
  if (!isAssignableRole(input.role)) {
    return { ok: false, error: t("errors.invalidRole") };
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
        ? t("errors.memberActiveExists")
        : t("errors.memberInactiveExists"),
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
      error: inviteErr?.message?.slice(0, 300) || t("errors.inviteSendFailed"),
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
      error: insertErr?.message?.slice(0, 300) || t("errors.memberRegisterFailed"),
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
  const t = await getT();

  if (!isAssignableRole(input.role)) {
    return { ok: false, error: t("errors.invalidRole") };
  }

  const db = await hiring();
  const { data: target, error: readErr } = await db
    .from("team_members")
    .select("id, team_role, workspace_id")
    .eq("id", input.memberId)
    .maybeSingle();
  if (readErr || !target) {
    return { ok: false, error: t("errors.memberNotFound") };
  }
  if (target.workspace_id !== acting.workspace_id) {
    return { ok: false, error: t("errors.crossWorkspaceEdit") };
  }
  // Demoting an owner would leave the workspace without one if they
  // were the last. Block the case entirely — owner changes go
  // through a separate, dedicated flow (transfer ownership).
  if (target.team_role === "owner") {
    return { ok: false, error: t("errors.ownerNotEditableHere") };
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
  const t = await getT();

  if (input.memberId === acting.id) {
    return { ok: false, error: t("errors.cannotDeactivateSelf") };
  }

  const db = await hiring();
  const { data: target } = await db
    .from("team_members")
    .select("id, team_role, workspace_id")
    .eq("id", input.memberId)
    .maybeSingle();
  if (!target) return { ok: false, error: t("errors.memberNotFound") };
  if (target.workspace_id !== acting.workspace_id) {
    return { ok: false, error: t("errors.crossWorkspaceEdit") };
  }
  if (target.team_role === "owner") {
    return { ok: false, error: t("errors.cannotDeactivateOwner") };
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
  const t = await getT();

  const db = await hiring();
  const { data: target } = await db
    .from("team_members")
    .select("id, workspace_id")
    .eq("id", input.memberId)
    .maybeSingle();
  if (!target) return { ok: false, error: t("errors.memberNotFound") };
  if (target.workspace_id !== acting.workspace_id) {
    return { ok: false, error: t("errors.crossWorkspaceEdit") };
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
  const t = await getT();
  const label = input.label.trim();
  if (!label) return { ok: false, error: t("errors.nameRequired") };
  if (label.length > 40) {
    return { ok: false, error: t("errors.max40Chars") };
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
    return { ok: false, error: t("errors.invalidBehavior") };
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
    return { ok: false, error: error?.message.slice(0, 300) || t("errors.createFailed") };
  }
  revalidatePath("/settings/job-statuses");
  revalidatePath("/jobs");
  return { ok: true, data: { id: data.id as string } };
}

/**
 * Patch an existing job status — label and/or color, on ANY row
 * (system rows included). The behavior triple (is_open / is_archived /
 * is_filled) is the only immutable part: it was either seeded or picked
 * at create time, and changing it would silently move jobs between
 * report buckets (a metrics-integrity footgun). It isn't patchable
 * through this action at all, so nothing here can touch it.
 */
export async function updateWorkspaceJobStatusAction(input: {
  id: string;
  label?: string;
  color?: string | null;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const t = await getT();

  const db = await hiring();
  const { data: row } = await db
    .from("job_statuses")
    .select("id")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { ok: false, error: t("errors.jobStatusNotFound") };

  // Label AND color are editable on every row (system rows included).
  // Only the behavior triple stays immutable — and it isn't patchable
  // through this action at all.
  const patch: Record<string, unknown> = {};
  if (typeof input.label === "string") {
    const trimmed = input.label.trim();
    if (!trimmed) return { ok: false, error: t("errors.nameRequired") };
    if (trimmed.length > 40) {
      return { ok: false, error: t("errors.max40Chars") };
    }
    patch.label = trimmed;
  }
  if (input.color !== undefined) {
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
  const t = await getT();
  const db = await hiring();
  const { data: row } = await db
    .from("job_statuses")
    .select("id, is_system")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { ok: false, error: t("errors.jobStatusNotFound") };
  if (row.is_system === true) {
    return {
      ok: false,
      error: t("errors.systemStatusNotDeletable"),
    };
  }
  const { count } = await db
    .from("jobs")
    .select("id", { head: true, count: "exact" })
    .eq("status_id", input.id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        (count ?? 0) === 1
          ? t("errors.jobStatusInUseOne", { count: count ?? 0 })
          : t("errors.jobStatusInUseMany", { count: count ?? 0 }),
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
