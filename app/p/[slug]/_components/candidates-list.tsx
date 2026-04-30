import { getCandidatesForJob } from "@/lib/cache";
import { CandidateRow } from "@/components/candidate-row";
import { EmptyState } from "@/components/empty-state";

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
    linkedin_url: c.linkedin_url,
    has_resume: c.has_resume,
    attachment_count: c.attachment_count,
    candidate_report_html: c.candidate_report_html,
    current_position: c.current_position,
    current_company: c.current_company,
  }));

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-background sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Position</th>
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="w-14 px-2 py-2.5 text-center font-medium">LinkedIn</th>
              <th className="w-14 px-2 py-2.5 text-center font-medium">Files</th>
              <th className="w-14 px-2 py-2.5 text-center font-medium">Report</th>
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
}
