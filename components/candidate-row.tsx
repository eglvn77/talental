import Link from "next/link";
import { LinkedinIcon } from "@/components/icons/linkedin-icon";
import { StageBadge } from "@/components/stage-badge";
import { ResumeModalButton } from "@/components/resume-modal-button";
import { NotesModalButton } from "@/components/notes-modal-button";
import { ReportModalButton } from "@/components/report-modal-button";
import { sanitizeReportHtml } from "@/lib/report-html";
import { formatCurrentComp } from "@/lib/format";
import { cn } from "@/lib/utils";

type RowCandidate = {
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

export function CandidateRow({
  candidate,
  portalSlug,
  as,
}: {
  candidate: RowCandidate;
  portalSlug: string;
  as: "tr" | "card";
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
  const dash = <span className="text-xs text-muted-foreground/40">—</span>;

  if (as === "tr") {
    return (
      <tr className="border-t border-border transition-colors hover:bg-muted/40">
        <td className="px-3 py-1">
          <Link
            href={detailHref}
            className="font-medium text-foreground hover:text-brand hover:underline"
          >
            {candidate.candidate_full_name}
          </Link>
        </td>
        <td className="px-3 py-1 text-muted-foreground">
          {candidate.current_position || dash}
        </td>
        <td className="px-3 py-1 text-muted-foreground">
          {candidate.current_company || dash}
        </td>
        <td className="px-3 py-1 text-muted-foreground">
          {candidate.location || dash}
        </td>
        <td className="px-3 py-1 whitespace-nowrap text-muted-foreground">
          {compLabel || dash}
        </td>
        <td className="px-3 py-1">
          <StageBadge stage={candidate.stage_name} />
        </td>
        <td className="px-2 py-1 text-center">
          {candidate.linkedin_url ? (
            <a
              href={candidate.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              )}
              aria-label="Open LinkedIn"
              title="Open LinkedIn"
            >
              <LinkedinIcon size={16} />
            </a>
          ) : (
            dash
          )}
        </td>
        <td className="px-2 py-1 text-center">
          {candidate.has_resume ? (
            <ResumeModalButton
              portalSlug={portalSlug}
              candidateSlug={candidate.candidate_slug}
              candidateName={candidate.candidate_full_name}
            />
          ) : (
            dash
          )}
        </td>
        <td className="px-2 py-1 text-center">
          <NotesModalButton
            portalSlug={portalSlug}
            candidateSlug={candidate.candidate_slug}
            candidateName={candidate.candidate_full_name}
          />
        </td>
        <td className="px-2 py-1 text-center">
          <ReportModalButton
            candidateName={candidate.candidate_full_name}
            reportHtml={sanitizedReport}
          />
        </td>
      </tr>
    );
  }

  // Mobile card
  const subtitle = [candidate.current_position, candidate.current_company]
    .filter((s): s is string => Boolean(s))
    .join(" @ ");
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={detailHref}
            className="truncate font-medium text-foreground hover:text-brand hover:underline"
          >
            {candidate.candidate_full_name}
          </Link>
          {subtitle ? (
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
        <StageBadge stage={candidate.stage_name} />
      </div>
      {candidate.location || compLabel ? (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {candidate.location ? <span>{candidate.location}</span> : null}
          {compLabel ? <span>{compLabel}</span> : null}
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        {candidate.linkedin_url ? (
          <a
            href={candidate.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open LinkedIn"
            title="Open LinkedIn"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LinkedinIcon size={16} />
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
