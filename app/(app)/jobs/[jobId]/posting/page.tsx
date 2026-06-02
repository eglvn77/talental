import { hiring, type JobRow, type ScreeningQuestion } from "@/lib/hiring";
import { loadSources } from "@/lib/sources";
import { sanitizeRichText } from "../../../_components/sanitize-html";
import { PostingEditor } from "./posting-editor";
import { PublicationStatusPicker } from "./publication-status-picker";
import { TrackingLinks, type TrackingLinkItem } from "./tracking-links";

export const dynamic = "force-dynamic";

/**
 * /jobs/[id]/posting — public-facing posting + apply form config.
 * Drives what candidates see on the public careers page + what the
 * apply form asks for.
 *
 * Visibility picker sits at the top so the admin can switch between
 * draft / listed / unlisted (and copy the public link) without
 * scrolling through the field editor. Everything below autosaves.
 */
export default async function JobPostingTab({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const db = await hiring();
  const { data } = await db
    .from("jobs")
    .select(
      "*, workspace:workspaces(slug), status:job_statuses(is_open)",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!data) return null;
  const job = data as JobRow & {
    workspace: { slug: string } | { slug: string }[] | null;
    status: { is_open: boolean } | null;
  };
  const workspaceSlug = Array.isArray(job.workspace)
    ? (job.workspace[0]?.slug ?? "")
    : (job.workspace?.slug ?? "");

  // Sanitize at read time too — defense in depth.
  const html = sanitizeRichText(
    (job.public_description as string | null) ?? "",
  );

  const screeningQuestions =
    (job.screening_questions as ScreeningQuestion[] | null) ?? [];

  // Tracking links + candidate sources for the "Create tracking link"
  // section. Links carry a ?src=<token> that auto-attributes applicants.
  const [candidateSources, { data: linkRows }] = await Promise.all([
    loadSources("candidate"),
    db
      .from("job_tracking_links")
      .select("id, token, label, source_id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
  ]);
  const trackingLinks = (linkRows ?? []) as TrackingLinkItem[];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 py-6">
      <PublicationStatusPicker
        jobId={job.id}
        initial={
          (job.publication_status as "draft" | "listed" | "unlisted") ??
          "draft"
        }
        workspaceSlug={workspaceSlug}
        jobSlug={job.slug as string}
        jobIsActive={job.status?.is_open === true}
      />

      <PostingEditor
        jobId={job.id}
        initialJob={{
          title: job.title,
          posting_language: job.posting_language as "es" | "en",
          work_modality: (job.work_modality as string | null) ?? null,
          location: (job.location as string | null) ?? null,
          location_lat: (job.location_lat as number | null) ?? null,
          location_lng: (job.location_lng as number | null) ?? null,
          location_place_id: (job.location_place_id as string | null) ?? null,
          contract_type: (job.contract_type as string | null) ?? null,
          working_hours: (job.working_hours as string | null) ?? null,
          salary_min: (job.salary_min as number | null) ?? null,
          salary_max: (job.salary_max as number | null) ?? null,
          salary_currency: (job.salary_currency as string | null) ?? null,
          salary_frequency: job.salary_frequency,
          show_salary_in_posting: job.show_salary_in_posting,
          show_company_in_posting: job.show_company_in_posting,
          require_cv: job.require_cv,
          require_cover_letter: job.require_cover_letter,
          ask_for_location: job.ask_for_location,
          ask_for_salary_expectations: job.ask_for_salary_expectations,
          screening_questions: screeningQuestions,
        }}
        initialHtml={html}
        mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
      />

      <TrackingLinks
        jobId={job.id}
        workspaceSlug={workspaceSlug}
        jobSlug={job.slug as string}
        sources={candidateSources}
        initialLinks={trackingLinks}
      />
    </div>
  );
}
