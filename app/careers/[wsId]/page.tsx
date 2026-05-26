import { notFound } from "next/navigation";
import { CareersHeader } from "../_components/header";
import { JobsList } from "../_components/jobs-list";
import {
  loadCareersPublishedJobs,
  loadCareersWorkspaceHeader,
} from "../_lib/data";

export const dynamic = "force-dynamic";

/**
 * Public careers landing for one workspace.
 * URL: jobs.<root>/<workspace_id>
 *
 * Renders the workspace's brand header + a filterable list of every
 * job that's currently `status='activa'` AND `publication_status='listed'`.
 * `unlisted` jobs are intentionally absent from this list — they're
 * reachable only by direct link.
 *
 * URL identifier is the workspace UUID, not the slug. Slugs can
 * collide across agencies; UUIDs don't. A pretty-URL redirect layer
 * (slug → id) would be a nice follow-up but isn't worth the breakage
 * risk for now.
 */
export default async function WorkspaceCareersLanding({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const [header, jobs] = await Promise.all([
    loadCareersWorkspaceHeader(wsId),
    loadCareersPublishedJobs(wsId),
  ]);

  if (!header) notFound();

  return (
    <>
      <CareersHeader header={header} />
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-foreground">
          Vacantes abiertas
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {jobs.length === 0
            ? "Por ahora no hay vacantes publicadas. Vuelve pronto."
            : `${jobs.length} ${jobs.length === 1 ? "rol abierto" : "roles abiertos"}.`}
        </p>
        {jobs.length > 0 ? <JobsList jobs={jobs} wsId={wsId} /> : null}
      </main>
    </>
  );
}
