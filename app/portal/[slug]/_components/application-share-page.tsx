import {
  Linkedin,
  FileText,
  MapPin,
  Briefcase,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { ParsedProfileSection } from "@/app/(app)/_components/parsed-profile";
import { AnonCommentForm } from "./anon-comment-form";
import { RightColumnTabs } from "./right-column-tabs";
import { CompanyLogoImg } from "./company-logo-img";
import { isProbablyHtml, markdownToHtml } from "@/lib/candidate-report/markdown-to-html";
import { getT } from "@/lib/i18n/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ApplicationSharePayload } from "@/lib/portal/load-application-share";

// English strings used by this page. We don't add them to the
// shared i18n bundle because that file is locked per AGENTS.md.
// The share page is intentionally English-only — recruiters share
// these links with clients across regions, and English is the
// least-bad lingua franca for a one-off public page.
const L = {
  downloadCv: "Download CV",
  interviewReport: "Interview report",
  reportPending: "Report not generated yet.",
  noProfile: "No structured profile available yet.",
  commentEmpty: "Be the first to leave feedback.",
};

/**
 * Public-facing candidate share page (scope='application' tokens).
 *
 * Layout v2:
 *   - Top header (full width): candidate identity + LinkedIn + CV
 *     button + a "For: <job> · <company>" pill so the client always
 *     remembers which vacancy they're reviewing.
 *   - Body (two equal columns on ≥lg, stacked on mobile):
 *     LEFT  = experience / education / skills (ParsedProfileSection)
 *     RIGHT = tabbed: Reporte (AI-generated) | Feedback (form+thread)
 *   - Stage chip removed — internal-only signal.
 */
export async function ApplicationSharePage({
  slug,
  payload,
}: {
  slug: string;
  payload: ApplicationSharePayload;
}) {
  const t = await getT();
  const { candidate, parsedProfile, job, application } = payload;

  // Server-fetch the comments thread once. The right-column tabs
  // just toggle visibility, so this stays in the server tree.
  const sb = getSupabaseAdmin();
  const { data: commentsRaw } = await sb
    .schema("hiring")
    .from("portal_comments")
    .select("id, body, sentiment, created_at, email_snapshot, author_name")
    .eq("application_id", application.id)
    .order("created_at", { ascending: false });
  const comments = ((commentsRaw ?? []) as Array<{
    id: string;
    body: string | null;
    sentiment: "up" | "down" | null;
    created_at: string;
    email_snapshot: string | null;
    author_name?: string | null;
  }>).map((c) => ({
    id: c.id,
    email: c.author_name?.trim() || c.email_snapshot || "Anonymous",
    body: c.body,
    sentiment: c.sentiment,
    created_at: c.created_at,
  }));

  const reportHtml = application.candidate_report
    ? isProbablyHtml(application.candidate_report)
      ? application.candidate_report
      : markdownToHtml(application.candidate_report)
    : null;

  // Slots passed into the RightColumnTabs client component.
  const reportSlot = (
    <>
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        {L.interviewReport}
      </div>
      {reportHtml ? (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: reportHtml }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{L.reportPending}</p>
      )}
      {application.report_generated_at ? (
        <p className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {new Date(application.report_generated_at).toLocaleDateString(
            "en-US",
            { day: "numeric", month: "short", year: "numeric" },
          )}
        </p>
      ) : null}
    </>
  );

  const feedbackSlot = (
    <>
      <AnonCommentForm slug={slug} />
      <ul className="mt-4 space-y-2">
        {comments.length === 0 ? (
          <li className="rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-4 text-center text-xs text-muted-foreground">
            {L.commentEmpty}
          </li>
        ) : (
          comments.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{c.email}</span>
                {c.sentiment === "up" ? (
                  <ThumbsUp className="h-3 w-3 text-positive" />
                ) : c.sentiment === "down" ? (
                  <ThumbsDown className="h-3 w-3 text-warning" />
                ) : null}
                <span className="ml-auto">
                  {new Date(c.created_at).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              {c.body ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                  {c.body}
                </p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </>
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* --- Top identity + job context header --- */}
      <header className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          {candidate.profile_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={candidate.profile_picture_url}
              alt={candidate.full_name}
              className="h-16 w-16 shrink-0 rounded-full border border-border bg-card object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-lg font-semibold text-muted-foreground"
            >
              {initials(candidate.full_name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-tight">
              {candidate.full_name}
            </h1>
            {candidate.headline ? (
              <p className="mt-0.5 text-sm text-foreground/80">
                {candidate.headline}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {candidate.current_position || candidate.current_company_name ? (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {[candidate.current_position, candidate.current_company_name]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
              {candidate.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {candidate.location}
                </span>
              ) : null}
            </div>
            {/* Job-context pill: gives the client persistent
                anchor for which vacancy they're reviewing. The
                client logo is prominent (h-6) so brand recognition
                is the primary visual cue; the "For:" / "Para:"
                preface was removed — the logo + title speak for
                themselves. */}
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-3 text-sm">
              {job.company_logo_resolved ? (
                <CompanyLogoImg
                  src={job.company_logo_resolved}
                  alt={job.company_name ?? ""}
                  fallback={
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold text-muted-foreground"
                    >
                      {(job.company_name ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  }
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold text-muted-foreground"
                >
                  {(job.company_name ?? "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="font-medium text-foreground">{job.title}</span>
              {job.company_name ? (
                <span className="text-muted-foreground">
                  · {job.company_name}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {candidate.linkedin_url ? (
              <a
                href={candidate.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Linkedin className="h-3.5 w-3.5" />
                LinkedIn
              </a>
            ) : null}
            {candidate.resume_url ? (
              <a
                href={candidate.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
              >
                <FileText className="h-3.5 w-3.5" />
                {L.downloadCv}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {/* --- Two equal columns: Experience | Tabs (Report / Feedback) --- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* LEFT — experience / education / skills */}
        <div>
          {parsedProfile ? (
            <section className="rounded-lg border border-border bg-card p-5">
              <ParsedProfileSection profile={parsedProfile} t={t} />
            </section>
          ) : (
            <section className="rounded-lg border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              {L.noProfile}
            </section>
          )}
        </div>

        {/* RIGHT — tabbed report / feedback */}
        <div>
          <RightColumnTabs
            reportSlot={reportSlot}
            feedbackSlot={feedbackSlot}
            feedbackCount={comments.length}
          />
        </div>
      </div>
    </main>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
