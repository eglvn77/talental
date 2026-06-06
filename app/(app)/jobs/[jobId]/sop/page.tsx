import { notFound } from "next/navigation";
import { hiring, type JobRow } from "@/lib/hiring";
import { getT } from "@/lib/i18n/server";
import {
  SOP_TEMPLATE,
  SOP_MARKER_PREFIX,
  sopMarker,
} from "@/lib/sop/template";
import { Sop, type SopTaskRow } from "../_components/sop";

export const dynamic = "force-dynamic";

/**
 * /jobs/[id]/sop — Talental's company-wide playbook for working a
 * vacante end-to-end. Lifted out of /paquete (it's the daily driver
 * and deserves its own top-level tab) and parked right before
 * Settings. The template (lib/sop/template.ts) is identical across
 * workspaces; checked-state is per-job and lives in hiring.tasks via
 * the `sop:v1` marker.
 *
 * On first load we lazy-seed any missing item so the checkbox UI
 * always has a row to flip.
 */
function parseSopTasks(
  rows: Array<{ id: string; status: string; body: string | null }>,
): Record<string, SopTaskRow> {
  const re = new RegExp(
    `${SOP_MARKER_PREFIX}\\s*\\|\\s*item:\\s*([a-z0-9-]+)`,
    "i",
  );
  const out: Record<string, SopTaskRow> = {};
  for (const r of rows) {
    if (!r.body) continue;
    const m = r.body.match(re);
    if (!m) continue;
    const itemId = m[1]!.trim();
    out[itemId] = { id: r.id, itemId, done: r.status === "done" };
  }
  return out;
}

export default async function JobSopPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const t = await getT();
  void t;
  const db = await hiring();
  const { data } = await db
    .from("jobs")
    .select("workspace_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) notFound();
  const job = data as Pick<JobRow, "workspace_id">;

  const { data: taskRows } = await db
    .from("tasks")
    .select("id, status, body, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: true });
  let sopRowsByItemId = parseSopTasks(taskRows ?? []);
  const missingItems = SOP_TEMPLATE.filter((it) => !sopRowsByItemId[it.id]);
  if (missingItems.length > 0) {
    const seedPayload = missingItems.map((it) => ({
      workspace_id: job.workspace_id,
      title: it.labelEn,
      body: sopMarker(it.id),
      status: "open" as const,
      priority: "normal" as const,
      entity_type: "job" as const,
      entity_id: jobId,
    }));
    const { data: inserted } = await db
      .from("tasks")
      .insert(seedPayload)
      .select("id, status, body");
    if (inserted) {
      sopRowsByItemId = {
        ...sopRowsByItemId,
        ...parseSopTasks(
          inserted as Array<{
            id: string;
            status: string;
            body: string | null;
          }>,
        ),
      };
    }
  }

  return (
    <div className="py-6">
      <Sop rowsByItemId={sopRowsByItemId} />
    </div>
  );
}
