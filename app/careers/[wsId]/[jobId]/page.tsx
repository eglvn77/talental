import { notFound } from "next/navigation";
import { CareersHeader } from "../../_components/header";
import { JobPostingBody } from "../../_components/job-posting-body";
import {
  loadCareersJobCustomFields,
  loadCareersPublishedJob,
  loadCareersWorkspaceHeader,
} from "../../_lib/data";

export const dynamic = "force-dynamic";

/**
 * Public posting page for a single vacante.
 * URL: jobs.<root>/<workspace_id>/<job_id>
 *
 * Renders the workspace's branded header + a compact sticky job
 * header (title + generalities) + the rich JD body + a sticky apply
 * button. Respects per-job visibility toggles (show_company /
 * show_salary). 404 if the job is `draft`, not `activa`, or
 * doesn't exist.
 *
 * Both identifiers are UUIDs. Slugs would have been prettier but a
 * recruiter renaming the vacante after publishing would silently
 * invalidate every shared link — see `_lib/data.ts` for context.
 */
export default async function JobPostingPage({
  params,
}: {
  params: Promise<{ wsId: string; jobId: string }>;
}) {
  const { wsId, jobId } = await params;
  const [header, job, customFields] = await Promise.all([
    loadCareersWorkspaceHeader(wsId),
    loadCareersPublishedJob(wsId, jobId),
    loadCareersJobCustomFields(wsId, jobId),
  ]);

  if (!header || !job) notFound();

  return (
    <>
      <CareersHeader
        header={header}
        jobLink={{ href: `/${wsId}`, label: "Ver todas las vacantes" }}
      />
      <JobPostingBody job={job} customFields={customFields} />
    </>
  );
}
