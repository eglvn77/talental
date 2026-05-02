import { getCandidatesForJob } from "@/lib/cache";
import { CandidateRow } from "@/components/candidate-row";
import { EmptyState } from "@/components/empty-state";
import { KanbanView } from "@/components/kanban-view";
import { PipelineSwitcher } from "@/components/pipeline-switcher";
import { relativeTimeShort } from "@/lib/format";

export async function CandidatesList({
  jobId,
  portalSlug,
}: {
  jobId: number;
  portalSlug: string;
}) {
  let candidates: Awaited<ReturnType<typeof getCandidatesForJob>>;
  try {
    candidates = await getCandidatesForJob(jobId);
  } catch {
    return (
      <EmptyState
        title="Couldn’t load candidates"
        description="Please refresh the page in a minute. If this keeps happening, contact your Talental partner."
      />
    );
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        title="No candidates yet"
        description="As soon as candidates are added to the pipeline, they will appear here."
      />
    );
  }

  const rows = candidates.map((c) => ({
    manatal_candidate_id: c.manatal_candidate_id,
    candidate_full_name: c.candidate_full_name,
    candidate_slug: c.candidate_slug,
    stage_name: c.stage_name,
    stage_rank: c.stage_rank,
    linkedin_url: c.linkedin_url,
    has_resume: c.has_resume,
    candidate_report_html: c.candidate_report_html,
    current_position: c.current_position,
    current_company: c.current_company,
    location: c.location,
    current_comp_amount: c.current_comp_amount,
    current_comp_currency: c.current_comp_currency,
    current_comp_frequency: c.current_comp_frequency,
  }));

  const freshest = candidates.reduce<number>((acc, r) => {
    const t = new Date(r.last_synced_at).getTime();
    return Number.isFinite(t) && t > acc ? t : acc;
  }, 0);
  const updatedLabel = freshest
    ? relativeTimeShort(new Date(freshest).toISOString())
    : null;

  const tableView = (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-background sm:block">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-1 font-medium">Name</th>
              <th className="px-3 py-1 font-medium">Position</th>
              <th className="px-3 py-1 font-medium">Company</th>
              <th className="px-3 py-1 font-medium">Location</th>
              <th className="px-3 py-1 font-medium">Current Comp</th>
              <th className="px-3 py-1 font-medium">Stage</th>
              <th className="w-12 px-2 py-1 text-center font-medium">LinkedIn</th>
              <th className="w-12 px-2 py-1 text-center font-medium">Files</th>
              <th className="w-12 px-2 py-1 text-center font-medium">Notes</th>
              <th className="w-12 px-2 py-1 text-center font-medium">Report</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <CandidateRow
                key={c.manatal_candidate_id}
                candidate={c}
                portalSlug={portalSlug}
                as="tr"
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked layout */}
      <div className="flex flex-col gap-3 sm:hidden">
        {rows.map((c) => (
          <CandidateRow
            key={c.manatal_candidate_id}
            candidate={c}
            portalSlug={portalSlug}
            as="card"
          />
        ))}
      </div>
    </>
  );

  const kanbanView = <KanbanView candidates={rows} portalSlug={portalSlug} />;

  return (
    <PipelineSwitcher
      tableView={tableView}
      kanbanView={kanbanView}
      updatedLabel={updatedLabel}
    />
  );
}
