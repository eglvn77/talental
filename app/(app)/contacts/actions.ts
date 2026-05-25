"use server";

import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth/session";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function ensure(): Promise<ActionResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Unauthorized" };
  return { ok: true };
}

function normEmail(v: string | undefined | null): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return s || null;
}

function trimOrNull(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return s || null;
}

export async function createContactAction(input: {
  fullName: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  title?: string;
  location?: string;
  companyId?: string;
}): Promise<ActionResult<{ contactId: string }>> {
  const guard = await ensure();
  if (!guard.ok) return guard;
  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "El nombre es requerido" };

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  const { data, error } = await db
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      full_name: fullName,
      email: normEmail(input.email),
      phone: trimOrNull(input.phone),
      linkedin_url: trimOrNull(input.linkedinUrl),
      title: trimOrNull(input.title),
      location: trimOrNull(input.location),
      company_id: input.companyId || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || "No se pudo crear el contacto",
    };
  }
  revalidatePath("/contacts");
  return { ok: true, data: { contactId: data.id as string } };
}

export async function updateContactAction(input: {
  contactId: string;
  patch: Partial<{
    full_name: string;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    title: string | null;
    location: string | null;
    notes_summary: string | null;
    company_id: string | null;
  }>;
}): Promise<ActionResult> {
  const guard = await ensure();
  if (!guard.ok) return guard;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) {
    if (v === undefined) continue;
    patch[k] = typeof v === "string" ? v.trim() || null : v;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const db = await hiring();
  const { error } = await db
    .from("contacts")
    .update(patch)
    .eq("id", input.contactId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/contacts");
  return { ok: true };
}

/**
 * Lightweight search used by combobox pickers. Returns at most
 * `limit` rows (default 10) matching the query on full_name OR
 * email (case-insensitive prefix). Empty query returns the top
 * results by created_at desc so the box has something to show on
 * focus.
 *
 * Workspace-scoped via RLS — the SQL doesn't need a workspace_id
 * filter because the tenant policies block cross-workspace reads.
 */
export async function searchContactsAction(
  query: string,
  limit = 10,
): Promise<
  | {
      ok: true;
      data: Array<{ id: string; full_name: string; email: string | null }>;
    }
  | { ok: false; error: string }
> {
  const guard = await ensure();
  if (!guard.ok) return guard;
  const q = query.trim();
  const db = await hiring();
  let req = db
    .from("contacts")
    .select("id, full_name, email")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(20, limit)));
  if (q.length > 0) {
    // ilike with % at both ends → substring match.
    req = req.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }
  const { data, error } = await req;
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  return {
    ok: true,
    data: (data ?? []) as Array<{
      id: string;
      full_name: string;
      email: string | null;
    }>,
  };
}

export async function deleteContactAction(
  contactId: string,
): Promise<ActionResult> {
  const guard = await ensure();
  if (!guard.ok) return guard;
  const db = await hiring();
  const { error } = await db.from("contacts").delete().eq("id", contactId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/contacts");
  return { ok: true };
}

/**
 * Bulk-delete contacts. Used by the selection toolbar on /contacts.
 * RLS already enforces workspace scope; we just feed the id list
 * to a single `IN (...)` delete. Returns how many actually deleted
 * so the UI can toast accurately.
 */
export async function bulkDeleteContactsAction(
  ids: string[],
): Promise<ActionResult<{ deleted: number }>> {
  const guard = await ensure();
  if (!guard.ok) return guard;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Sin contactos para eliminar" };
  }
  const db = await hiring();
  const { data, error } = await db
    .from("contacts")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/contacts");
  return { ok: true, data: { deleted: (data ?? []).length } };
}
