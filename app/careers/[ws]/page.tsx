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
        {jobs.length === 0 ? (
          // Dedicated empty state — a single muted line read as if
          // the page was broken. The illustrated panel makes it clear
          // it's a deliberate "nothing here yet" instead of an error.
          <div className="rounded-lg border border-dashed border-border bg-bg-1 px-6 py-14 text-center">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <span aria-hidden className="text-xl">
                ✦
              </span>
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              Por ahora no hay vacantes publicadas
            </h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Vuelve pronto — estamos preparando nuevas oportunidades.
              Mientras tanto puedes seguirnos en LinkedIn para enterarte
              cuando abramos roles nuevos.
            </p>
          </div>
        ) : (
          <JobsList jobs={jobs} wsSlug={ws} />
        )}
      </main>
    </>
  );
}
