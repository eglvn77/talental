import { notFound } from "next/navigation";
import { CareersHeader } from "../../_components/header";
import { JobPostingBody } from "../../_components/job-posting-body";
import {
  loadCareersPublishedJob,
  loadCareersWorkspaceHeader,
} from "../../_lib/data";

export const dynamic = "force-dynamic";

/**
 * Public posting page for a single vacante.
 * URL: jobs.<root>/<workspace_slug>/<job_slug>
 *
 * Renders the workspace's branded header + a compact sticky job
 * header (title + generalities) + the rich JD body + a sticky apply
 * button. Respects per-job visibility toggles (show_company /
 * show_salary). 404 if the job is `draft`, not `activa`, or
 * doesn't exist.
 */
export default async function JobPostingPage({
  params,
}: {
  params: Promise<{ ws: string; slug: string }>;
}) {
  const { ws, slug } = await params;
  const [header, job] = await Promise.all([
    loadCareersWorkspaceHeader(ws),
    loadCareersPublishedJob(ws, slug),
  ]);

  if (!header || !job) notFound();

  return (
    <>
      <CareersHeader
        header={header}
        jobLink={{ href: `/${ws}`, label: "Ver todas las vacantes" }}
      />
      <JobPostingBody job={job} />
    </>
  );
}
