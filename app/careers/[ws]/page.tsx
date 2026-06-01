import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CareersHeader } from "../_components/header";
import { JobsList } from "../_components/jobs-list";
import {
  loadCareersPublishedJobs,
  loadCareersWorkspaceHeader,
  resolveHistoricSlug,
} from "../_lib/data";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Open Graph for the workspace landing — what shows up when the
 * recruiter pastes `/<ws>` into WhatsApp / LinkedIn / Slack.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ ws: string }>;
}): Promise<Metadata> {
  const { ws } = await params;
  const t = await getT();
  const header = await loadCareersWorkspaceHeader(ws);
  if (!header) return { title: t("careers.metaCareers") };
  const title = t("careers.metaLandingTitle", { name: header.name });
  const description =
    header.careers_tagline ??
    t("careers.metaLandingDescription", { name: header.name });
  const ogImage =
    (header.careers_theme === "dark" ? header.logo_url_dark : null) ??
    header.logo_url ??
    header.logo_url_dark ??
    undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: header.name,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

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
  const t = await getT();
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
              {t("careers.emptyTitle")}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              {t("careers.emptyBody")}
            </p>
          </div>
        ) : (
          <JobsList jobs={jobs} wsSlug={ws} />
        )}
      </main>
    </>
  );
}
