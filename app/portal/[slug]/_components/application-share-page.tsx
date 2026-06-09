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
import { isProbablyHtml, markdownToHtml } from "@/lib/candidate-report/markdown-to-html";
import { getT } from "@/lib/i18n/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ApplicationSharePayload } from "@/lib/portal/load-application-share";

// Localized strings used by this page. We don't add them to the
// shared i18n bundle because that file is locked per AGENTS.md.
// The portal default locale is Spanish; English fall-through is
// fine for the small set of strings used here.
const L = {
  downloadCv: "Descargar CV",
  interviewReport: "Reporte de entrevista",
  reportPending: "Reporte aún no generado.",
  forJob: "Para la vacante",
  currentStage: "Etapa actual",
  feedback: "Feedback",
  noProfile: "Aún no hay perfil estructurado.",
  commentEmpty: "Sé la primera persona en comentar.",
};

/**
 * Public-facing candidate share page rendered when a portal token's
 * scope='application'. The recruiter sends this link to a client;
 * the client gets a clean read-only view of the candidate's profile
 * in the context of the specific job they're being submitted for,
 * plus the AI-generated interview report, plus a feedback form
 * gated only by a name (no email required).
 *
 * Layout:
 *   - Header: name, photo, headline, current position, location,
 *     LinkedIn button, "Download CV" button when resume_url present.
 *   - Two-column body:
 *     - LEFT (primary): experience / education / skills (re-uses
 *       ParsedProfileSection), then AI interview report below.
 *     - RIGHT (sidebar): job context + pipeline stage, feedback
 *       thread + new-comment form, recruiter contact info.
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

  // Pull comments for the thread (server-side, no auth needed — we
  // already validated the token upstream).
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
    email: c.author_name?.trim() || c.email_snapshot || "Anónimo",
    body: c.body,
    sentiment: c.sentiment,
    created_at: c.created_at,
  }));

  const reportHtml = application.candidate_report
    ? isProbablyHtml(application.candidate_report)
      ? application.candidate_report
      : markdownToHtml(application.candidate_report)
    : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* --- Top identity block --- */}
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

      {/* --- Two-column body --- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* LEFT column */}
        <div className="space-y-5">
          {/* Experience + Education + Skills + Languages */}
          {parsedProfile ? (
            <section className="rounded-lg border border-border bg-card p-5">
              <ParsedProfileSection profile={parsedProfile} t={t} />
            </section>
          ) : (
            <section className="rounded-lg border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              {L.noProfile}
            </section>
          )}

          {/* AI interview report */}
          <section className="rounded-lg border border-border bg-card p-5">
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
              <p className="text-sm text-muted-foreground">
                {L.reportPending}
              </p>
            )}
            {application.report_generated_at ? (
              <p className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                {new Date(application.report_generated_at).toLocaleDateString(
                  "es-MX",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </p>
            ) : null}
          </section>
        </div>

        {/* RIGHT sidebar */}
        <aside className="space-y-5">
          {/* Job context */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {L.forJob}
            </div>
            <div className="mt-1.5 flex items-start gap-2.5">
              {job.company_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={job.company_logo_url}
                  alt={job.company_name ?? ""}
                  className="h-7 w-7 shrink-0 rounded-md border border-border bg-background object-contain"
                />
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{job.title}</p>
                {job.company_name ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {job.company_name}
                  </p>
                ) : null}
              </div>
            </div>
            {application.stage_name ? (
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {L.currentStage}
                </div>
                <span
                  className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    background: (application.stage_color ?? "#94a3b8") + "22",
                    color: application.stage_color ?? "#475569",
                  }}
                >
                  {application.stage_name}
                </span>
              </div>
            ) : null}
          </section>

          {/* Comments / feedback */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {L.feedback}{" "}
              {comments.length > 0 ? `(${comments.length})` : null}
            </div>
            <div className="mt-3">
              <AnonCommentForm slug={slug} />
            </div>
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
                      <span className="font-medium text-foreground">
                        {c.email}
                      </span>
                      {c.sentiment === "up" ? (
                        <ThumbsUp className="h-3 w-3 text-positive" />
                      ) : c.sentiment === "down" ? (
                        <ThumbsDown className="h-3 w-3 text-warning" />
                      ) : null}
                      <span className="ml-auto">
                        {new Date(c.created_at).toLocaleDateString("es-MX", {
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
          </section>
        </aside>
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
