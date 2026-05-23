"use server";

import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth/session";
import { hiring, getRequestWorkspaceId, type DealStage } from "@/lib/hiring";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function ensure(): Promise<ActionResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Unauthorized" };
  return { ok: true };
}

const TERMINAL: ReadonlySet<DealStage> = new Set(["won", "lost"]);

export async function createDealAction(input: {
  title: string;
  companyId?: string | null;
  primaryContactId?: string | null;
  stage?: DealStage;
  valueAmount?: number | null;
  valueCurrency?: string | null;
  expectedCloseDate?: string | null;
}): Promise<ActionResult<{ dealId: string }>> {
  const guard = await ensure();
  if (!guard.ok) return guard;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "El título es requerido" };

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const stage = input.stage ?? "lead";
  const { data, error } = await db
    .from("deals")
    .insert({
      workspace_id: workspaceId,
      title,
      company_id: input.companyId || null,
      primary_contact_id: input.primaryContactId || null,
      stage,
      value_amount: input.valueAmount ?? null,
      value_currency: input.valueCurrency || "MXN",
      expected_close_date: input.expectedCloseDate || null,
      closed_at: TERMINAL.has(stage) ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 300) || "No se pudo crear el deal",
    };
  }
  revalidatePath("/deals");
  return { ok: true, data: { dealId: data.id as string } };
}

export async function updateDealAction(input: {
  dealId: string;
  patch: Partial<{
    title: string;
    stage: DealStage;
    company_id: string | null;
    primary_contact_id: string | null;
    value_amount: number | null;
    value_currency: string | null;
    expected_close_date: string | null;
    description: string | null;
  }>;
}): Promise<ActionResult> {
  const guard = await ensure();
  if (!guard.ok) return guard;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) {
    if (v === undefined) continue;
    patch[k] = typeof v === "string" ? v.trim() || null : v;
  }
  // Stamp closed_at when transitioning to terminal stage; clear when reopening.
  if (input.patch.stage) {
    patch.closed_at = TERMINAL.has(input.patch.stage)
      ? new Date().toISOString()
      : null;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const db = await hiring();
  const { error } = await db.from("deals").update(patch).eq("id", input.dealId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/deals");
  return { ok: true };
}

export async function moveDealStageAction(
  dealId: string,
  stage: DealStage,
): Promise<ActionResult> {
  return updateDealAction({ dealId, patch: { stage } });
}

export async function deleteDealAction(
  dealId: string,
): Promise<ActionResult> {
  const guard = await ensure();
  if (!guard.ok) return guard;
  const db = await hiring();
  const { error } = await db.from("deals").delete().eq("id", dealId);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath("/deals");
  return { ok: true };
}
