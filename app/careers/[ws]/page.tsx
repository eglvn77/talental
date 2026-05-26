import { notFound, redirect } from "next/navigation";
import { CareersHeader } from "../_components/header";
import { JobsList } from "../_components/jobs-list";
import {
  loadCareersPublishedJobs,
  loadCareersWorkspaceHeader,
  resolveHistoricSlug,
} from "../_lib/data";

export const dynamic = "force-dynamic";

/**
 * Public careers landing for one workspace.
 * URL: jobs.<root>/<workspace_slug>
 *
 * Renders the workspace's brand header + a filterable list of every
 * job that's currently `status='activa'` AND `publication_status='listed'`.
 * `unlisted` jobs are intentionally absent from this list — they're
 * reachable only by direct link.
 *
 * Public identifier is the workspace slug. Globally UNIQUE in the DB,
 * and the signup flow auto-disambiguates collisions (talental,
 * talental-2, …), so the URL stays both readable and stable.
 */
export default async function WorkspaceCareersLanding({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const header = await loadCareersWorkspaceHeader(ws);
  if (!header) {
    // Maybe the recruiter renamed the workspace recently; honor old
    // links for 30 days via a 301 to the current slug.
    const current = await resolveHistoricSlug(ws);
    if (current) redirect(`/${current}`);
    notFound();
  }
  const jobs = await loadCareersPublishedJobs(ws);

  return (
    <>
      <CareersHeader header={header} landingHref={`/careers/${ws}`} />
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-foreground">
          Vacantes abiertas
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {jobs.length === 0
            ? "Por ahora no hay vacantes publicadas. Vuelve pronto."
            : `${jobs.length} ${jobs.length === 1 ? "rol abierto" : "roles abiertos"}.`}
        </p>
        {jobs.length > 0 ? <JobsList jobs={jobs} wsSlug={ws} /> : null}
      </main>
    </>
  );
}
