import { hiring, type JobRow, type ScreeningQuestion } from "@/lib/hiring";
import { sanitizeRichText } from "../../../_components/sanitize-html";
import { PostingEditor } from "./posting-editor";

export const dynamic = "force-dynamic";

/**
 * /jobs/[id]/posting — public-facing posting + apply form config.
 * Replaces the old /description tab. Everything here drives what
 * candidates see on /careers/<jobId> and what the apply form asks
 * for.
 *
 * The page is server-rendered; the editor below autosaves each
 * field on blur/change (no global Save button — same pattern as
 * Settings).
 */
export default async function JobPostingTab({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const { data } = await (await hiring())
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) return null;
  const job = data as JobRow;

  // Sanitize at read time too — defense in depth. The write path
  // already sanitizes, but rows created before the sanitizer was
  // wired up could still carry stale HTML.
  const html = sanitizeRichText(
    (job.public_description as string | null) ?? "",
  );

  const screeningQuestions =
    (job.screening_questions as ScreeningQuestion[] | null) ?? [];

  return (
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
        require_cv: job.require_cv,
        require_cover_letter: job.require_cover_letter,
        ask_for_location: job.ask_for_location,
        ask_for_salary_expectations: job.ask_for_salary_expectations,
        screening_questions: screeningQuestions,
      }}
      initialHtml={html}
    />
  );
}
