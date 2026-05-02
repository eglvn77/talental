import Link from "next/link";
import { LinkedinIcon } from "@/components/icons/linkedin-icon";
import { ResumeModalButton } from "@/components/resume-modal-button";
import { NotesModalButton } from "@/components/notes-modal-button";
import { ReportModalButton } from "@/components/report-modal-button";
import { sanitizeReportHtml } from "@/lib/report-html";
import { formatCurrentComp } from "@/lib/format";

export type RowCandidate = {
  manatal_candidate_id: number;
  candidate_full_name: string;
  candidate_slug: string;
  stage_name: string | null;
  linkedin_url: string | null;
  has_resume: boolean;
  candidate_report_html: string | null;
  current_position: string | null;
  current_company: string | null;
  location: string | null;
  current_comp_amount: number | null;
  current_comp_currency: string | null;
  current_comp_frequency: string | null;
};

export function CandidateCard({
  candidate,
  portalSlug,
}: {
  candidate: RowCandidate;
  portalSlug: string;
}) {
  const detailHref = `/p/${portalSlug}/c/${candidate.candidate_slug}`;
  const sanitizedReport = candidate.candidate_report_html
    ? sanitizeReportHtml(candidate.candidate_report_html)
    : null;
  const compLabel = formatCurrentComp(
    candidate.current_comp_amount,
    candidate.current_comp_currency,
    candidate.current_comp_frequency,
  );
  const subtitle = [candidate.current_position, candidate.current_company]
    .filter((s): s is string => Boolean(s))
    .join(" @ ");

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-xs transition-shadow hover:shadow-sm">
      <Link
        href={detailHref}
        className="block min-w-0 truncate text-sm font-medium text-foreground hover:text-brand hover:underline"
      >
        {candidate.candidate_full_name}
      </Link>
      {subtitle ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
      {candidate.location ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {candidate.location}
        </p>
      ) : null}
      {compLabel ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{compLabel}</p>
      ) : null}
      <div className="mt-2 flex items-center gap-1">
        {candidate.linkedin_url ? (
          <a
            href={candidate.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open LinkedIn"
            title="Open LinkedIn"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LinkedinIcon size={14} />
          </a>
        ) : null}
        {candidate.has_resume ? (
          <ResumeModalButton
            portalSlug={portalSlug}
            candidateSlug={candidate.candidate_slug}
            candidateName={candidate.candidate_full_name}
          />
        ) : null}
        <NotesModalButton
          portalSlug={portalSlug}
          candidateSlug={candidate.candidate_slug}
          candidateName={candidate.candidate_full_name}
        />
        <ReportModalButton
          candidateName={candidate.candidate_full_name}
          reportHtml={sanitizedReport}
        />
      </div>
    </div>
  );
}
