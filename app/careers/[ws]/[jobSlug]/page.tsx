import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CareersHeader } from "../../_components/header";
import { JobPostingBody } from "../../_components/job-posting-body";
import {
  loadCareersJobCustomFields,
  loadCareersPublishedJob,
  loadCareersWorkspaceHeader,
  resolveHistoricSlug,
} from "../../_lib/data";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Open Graph + standard meta for the public posting. Drives how the
 * link previews in WhatsApp / LinkedIn / Slack / iMessage. Pulled
 * from the same RPCs as the page itself, so the preview always
 * matches what the candidate would see if they followed the link.
 *
 * The og:image is rendered dynamically by the sibling
 * `opengraph-image.tsx` file (Next.js convention) — a 1200×630 card
 * with the job title, org name, and Talental branding.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ ws: string; jobSlug: string }>;
}): Promise<Metadata> {
  const { ws, jobSlug } = await params;
  const t = await getT();
  const [header, job] = await Promise.all([
    loadCareersWorkspaceHeader(ws),
    loadCareersPublishedJob(ws, jobSlug),
  ]);
  if (!header || !job) return { title: t("careers.metaJobNotFound") };

  const orgName =
    job.show_company_in_posting && job.company_name
      ? job.company_name
      : header.name;
  const title = `${job.title} · ${orgName}`;

  // Short summary built from the structured fields (modality +
  // location) so the preview reads well even when public_description
  // is empty. Falls back to the JD's plain-text head otherwise.
  const modalityKeys = new Set(["remote", "hybrid", "onsite"]);
  const chips: string[] = [];
  if (job.work_modality)
    chips.push(
      modalityKeys.has(job.work_modality)
        ? t(`careers.modality.${job.work_modality}`)
        : job.work_modality,
    );
  if (job.location) chips.push(job.location);
  const summary = chips.join(" · ");
  const jdText = (job.public_description ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const description =
    summary && jdText
      ? `${summary}. ${jdText}`
      : summary ||
        jdText ||
        t("careers.metaApplyFallback", { title: job.title, org: orgName });

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: header.name,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

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
  const t = await getT();
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
          label: t("careers.viewAllJobs"),
        }}
      />
      <JobPostingBody job={job} customFields={customFields} />
    </>
  );
}
