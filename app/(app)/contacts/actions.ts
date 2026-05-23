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
