import { notFound } from "next/navigation";
import { hiring, type JobRow } from "@/lib/hiring";
import { loadSopForJob } from "@/lib/sop/loader";
import { Sop } from "../_components/sop";

export const dynamic = "force-dynamic";

/**
 * /jobs/[id]/sop — Talental's company-wide playbook for working a
 * vacante end-to-end. Items + phases come from the workspace's
 * `resource_definitions.template_json` for key='sop' (seeded at
 * workspace creation; editable from /settings/resources). Per-job
 * done-state lives in `resource_values.value.checked[]`.
 *
 * No more hiring.tasks rows for SOP, no more lazy-seed step — the
 * template lives in the definition, the done-state defaults to
 * empty, and the toggle action upserts on first click.
 */
export default async function JobSopPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const db = await hiring();
  const { data } = await db
    .from("jobs")
    .select("workspace_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) notFound();
  const job = data as Pick<JobRow, "workspace_id">;

  const sop = await loadSopForJob({
    db,
    workspaceId: job.workspace_id,
    jobId,
  });

  return (
    <div className="py-6">
      <Sop
        jobId={jobId}
        template={sop.template}
        checked={sop.checked}
      />
    </div>
  );
}
