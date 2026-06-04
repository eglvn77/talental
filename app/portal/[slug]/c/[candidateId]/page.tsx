import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Linkedin, Mail, Phone } from "lucide-react";
import { resolvePortalToken } from "@/lib/portal/resolve-token";
import { readPortalSession } from "@/lib/portal/session";
import { tokenCanSeeJob } from "@/lib/portal/access";
import { loadPortalCandidate } from "@/lib/portal/load-candidate";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getT } from "@/lib/i18n/server";
import type { CompanyRow } from "@/lib/hiring";
import { EmailGate } from "../../_components/email-gate";
import { PortalHeader } from "../../_components/portal-header";
import { PortalInvalid } from "../../_components/portal-invalid";
import { PortalCommentsThread } from "../../_components/portal-comments-thread";
import { PortalCommentForm } from "../../_components/portal-comment-form";

export const dynamic = "force-dynamic";

export default async function PortalCandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; candidateId: string }>;
  searchParams: Promise<{ app?: string }>;
}) {
  const { slug, candidateId } = await params;
  const sp = await searchParams;
  if (!sp.app) return notFound();

  const token = await resolvePortalToken(slug);
  if (!token) return <PortalInvalid />;
  const session = await readPortalSession(token);
  if (!session) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6">
        <EmailGate slug={slug} />
      </main>
    );
  }

  // Resolve job_id from application; token must be allowed to see it.
  const sb = getSupabaseAdmin();
  const { data: app } = await sb
    .schema("hiring")
    .from("applications")
    .select("id, job_id")
    .eq("id", sp.app)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (!app) return notFound();
  const jobId = app.job_id as string;
  if (!(await tokenCanSeeJob(token, jobId))) return notFound();

  const view = await loadPortalCandidate({
    candidateId,
    applicationId: sp.app,
    jobId,
    workspaceId: token.workspace_id,
  });
  if (!view) return notFound();

  const t = await getT();
  const { candidate, stage, customFields, comments, experience, education, settings } = view;
  const showLinkedin = settings?.show_linkedin_url ?? true;
  const showEmail = settings?.show_email ?? false;
  const showPhone = settings?.show_phone ?? false;
  const showCv = settings?.show_attachments ?? true;
  const allowFeedback = settings?.allow_feedback ?? true;

  // Branding
  const { data: job } = await sb
    .schema("hiring")
    .from("jobs")
    .select("title, company_id")
    .eq("id", jobId)
    .maybeSingle();
  let company: CompanyRow | null = null;
  if (job?.company_id) {
    const { data } = await sb
      .schema("hiring")
      .from("companies")
      .select("*")
      .eq("id", job.company_id as string)
      .maybeSingle();
    company = (data as CompanyRow | null) ?? null;
  }

  const backHref =
    token.scope === "company"
      ? `/portal/${slug}/j/${jobId}`
      : `/portal/${slug}`;

  return (
    <>
      <PortalHeader
        slug={slug}
        companyName={company?.name ?? null}
        companyLogoUrl={company?.logo_url ?? null}
        jobTitle={(job?.title as string) ?? ""}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("portal.backToJobs")}
        </Link>

        {/* Identity */}
        <section className="mt-4 flex items-start gap-4">
          {candidate.profile_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={candidate.profile_picture_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-full bg-muted text-center text-lg font-medium leading-[64px] text-muted-foreground">
              {(candidate.full_name ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">{candidate.full_name}</h1>
            {candidate.headline ? (
              <p className="text-sm text-muted-foreground">
                {candidate.headline}
              </p>
            ) : null}
            {candidate.current_position || candidate.current_company_name ? (
              <p className="text-xs text-muted-foreground">
                {candidate.current_position}
                {candidate.current_company_name
                  ? ` · ${candidate.current_company_name}`
                  : ""}
              </p>
            ) : null}
            {candidate.city || candidate.country ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {[candidate.city, candidate.country].filter(Boolean).join(", ")}
              </p>
            ) : null}
            {stage ? (
              <span
                className="mt-2 inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px]"
                style={{
                  backgroundColor: (stage.color || "#888") + "22",
                  color: stage.color || undefined,
                }}
              >
                {stage.name}
              </span>
            ) : null}
          </div>
        </section>

        {/* Contact strip (gated) */}
        {(showEmail && candidate.email) ||
        (showPhone && candidate.phone) ||
        (showLinkedin && candidate.linkedin_url) ||
        (showCv && candidate.resume_url) ? (
          <section className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {showEmail && candidate.email ? (
              <a
                href={`mailto:${candidate.email}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-foreground/5"
              >
                <Mail className="h-3 w-3" /> {candidate.email}
              </a>
            ) : null}
            {showPhone && candidate.phone ? (
              <a
                href={`tel:${candidate.phone}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-foreground/5"
              >
                <Phone className="h-3 w-3" /> {candidate.phone}
              </a>
            ) : null}
            {showLinkedin && candidate.linkedin_url ? (
              <a
                href={candidate.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-foreground/5"
              >
                <Linkedin className="h-3 w-3" /> LinkedIn
              </a>
            ) : null}
            {showCv && candidate.resume_url ? (
              <a
                href={candidate.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-foreground/5"
              >
                <Download className="h-3 w-3" /> {t("portal.cv")}
              </a>
            ) : null}
          </section>
        ) : null}

        {/* Summary */}
        {candidate.summary ? (
          <section className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("portal.profile")}
            </h2>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {candidate.summary}
            </p>
          </section>
        ) : null}

        {/* Custom fields */}
        {customFields.length > 0 ? (
          <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {customFields.map((cf) => (
              <div key={cf.key} className="rounded-md border border-border bg-bg-2 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {cf.label}
                </p>
                <p className="mt-0.5 truncate text-sm">{formatValue(cf.value)}</p>
              </div>
            ))}
          </section>
        ) : null}

        {/* Experience */}
        {experience.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("portal.experience")}
            </h2>
            <ul className="mt-2 space-y-3">
              {experience.map((e) => (
                <li
                  key={e.id as string}
                  className="rounded-md border border-border bg-bg-2 px-3 py-2"
                >
                  <p className="text-sm font-medium">{String(e.position ?? "")}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(e.company_name ?? "")}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(e.start_date)} — {e.is_current ? "Actual" : fmtDate(e.end_date)}
                  </p>
                  {e.description ? (
                    <p className="mt-1 whitespace-pre-line text-xs">
                      {String(e.description)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Education */}
        {education.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("portal.education")}
            </h2>
            <ul className="mt-2 space-y-3">
              {education.map((e) => (
                <li key={e.id as string} className="rounded-md border border-border bg-bg-2 px-3 py-2">
                  <p className="text-sm font-medium">{String(e.school ?? "")}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(e.degree ?? "")}
                    {e.field_of_study ? ` · ${e.field_of_study}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(e.start_date)} — {fmtDate(e.end_date)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Comments */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold">{t("portal.commentsTitle")}</h2>
          <PortalCommentsThread comments={comments} t={t} />
          {allowFeedback ? (
            <PortalCommentForm slug={slug} applicationId={sp.app} />
          ) : null}
        </section>
      </main>
    </>
  );
}

function fmtDate(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 7);
  return String(v);
}

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}
