import { notFound, redirect } from "next/navigation";
import { CareersHeader } from "../../_components/header";
import { JobPostingBody } from "../../_components/job-posting-body";
import {
  loadCareersJobCustomFields,
  loadCareersPublishedJob,
  loadCareersWorkspaceHeader,
  resolveHistoricSlug,
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
 *
 * Both identifiers are slugs and both are stable. The workspace slug
 * has a UNIQUE constraint and the signup flow disambiguates
 * collisions. The job slug is generated from the title on INSERT and
 * then frozen by a Postgres trigger — renaming the vacante won't
 * change the URL, so shared links survive title edits.
 */
export default async function JobPostingPage({
  params,
}: {
  params: Promise<{ ws: string; jobSlug: string }>;
}) {
  const { ws, jobSlug } = await params;
  const header = await loadCareersWorkspaceHeader(ws);
  if (!header) {
    const current = await resolveHistoricSlug(ws);
    if (current) redirect(`/${current}/${jobSlug}`);
    notFound();
  }
  const [job, customFields] = await Promise.all([
    loadCareersPublishedJob(ws, jobSlug),
    loadCareersJobCustomFields(ws, jobSlug),
  ]);
  if (!job) notFound();

  return (
    <>
      <CareersHeader
        header={header}
        landingHref={`/careers/${ws}`}
        jobLink={{
          href: `/careers/${ws}`,
          label: "Ver todas las vacantes",
        }}
      />
      <JobPostingBody job={job} customFields={customFields} />
    </>
  );
}
