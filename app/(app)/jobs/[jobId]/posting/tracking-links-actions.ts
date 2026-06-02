"use server";

import { revalidatePath } from "next/cache";
import { hiring, getRequestWorkspaceId, type JobTrackingLinkRow } from "@/lib/hiring";
import { requireAdmin } from "@/lib/auth/team";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function randomToken(): string {
  // Short, URL-safe slug from a random UUID.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export async function createJobTrackingLinkAction(input: {
  jobId: string;
  sourceId: string | null;
  label?: string | null;
}): Promise<ActionResult<{ link: JobTrackingLinkRow }>> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Unique token within the workspace (retry on the rare collision).
  let token = randomToken();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await db
      .from("job_tracking_links")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("token", token)
      .maybeSingle();
    if (!clash) break;
    token = randomToken();
  }

  const { data, error } = await db
    .from("job_tracking_links")
    .insert({
      workspace_id: workspaceId,
      job_id: input.jobId,
      source_id: input.sourceId || null,
      token,
      label: input.label?.trim() || null,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message.slice(0, 300) || "Failed to create" };
  }
  revalidatePath(`/jobs/${input.jobId}/posting`);
  return { ok: true, data: { link: data as JobTrackingLinkRow } };
}

export async function deleteJobTrackingLinkAction(input: {
  id: string;
  jobId: string;
}): Promise<ActionResult> {
  const g = await requireAdmin();
  if (!g.ok) return g;
  const db = await hiring();
  const { error } = await db
    .from("job_tracking_links")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message.slice(0, 300) };
  revalidatePath(`/jobs/${input.jobId}/posting`);
  return { ok: true };
}
