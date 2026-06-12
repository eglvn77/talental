import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Linkedin,
  Mail,
  Phone,
} from "lucide-react";
import { resolvePortalToken } from "@/lib/portal/resolve-token";
import { readPortalSession } from "@/lib/portal/session";
import { tokenCanSeeJob } from "@/lib/portal/access";
import { loadPortalCandidate } from "@/lib/portal/load-candidate";
import { effectiveToggle } from "@/lib/portal/visible-fields";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getT } from "@/lib/i18n/server";
import type { CompanyRow } from "@/lib/hiring";
import { ParsedProfileSection } from "@/app/(app)/_components/parsed-profile";
import { EmailGate } from "../../_components/email-gate";
import { PortalHeader } from "../../_components/portal-header";
import { PortalInvalid } from "../../_components/portal-invalid";
import { PortalCommentsThread } from "../../_components/portal-comments-thread";
import { PortalCommentForm } from "../../_components/portal-comment-form";
import { PortalRealtime } from "../../_components/portal-realtime";

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
  const { candidate, stage, customFields, comments, profile, settings, cvUrl } =
    view;
  const set = settings as Record<string, unknown> | null;
  const showLinkedin = effectiveToggle(set, "show_linkedin_url");
  const showEmail = effectiveToggle(set, "show_email");
  const showPhone = effectiveToggle(set, "show_phone");
  const showCv = effectiveToggle(set, "show_attachments");
  const allowFeedback = effectiveToggle(set, "allow_feedback");

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

  // Prev/next within the job's portal-visible pipeline, in the same
  // order the kanban shows (stage position, then most-recent first).
  // Lets the client page through candidates without going back to the
  // board each time.
  const { data: navStages } = await sb
    .schema("hiring")
    .from("pipeline_stages")
    .select("id, position")
    .eq("job_id", jobId)
    .eq("client_portal_visible", true)
    .order("position", { ascending: true });
  const stagePos = new Map(
    (navStages ?? []).map((s) => [s.id as string, s.position as number]),
  );
  let prevHref: string | null = null;
  let nextHref: string | null = null;
  let navIndex = 0;
  let navTotal = 0;
  if (stagePos.size > 0) {
    const { data: navApps } = await sb
      .schema("hiring")
      .from("applications")
      .select("id, candidate_id, stage_id, status_changed_at")
      .eq("job_id", jobId)
      .in("stage_id", Array.from(stagePos.keys()));
    const ordered = (navApps ?? [])
      .map((a) => ({
        appId: a.id as string,
        candidateId: a.candidate_id as string,
        pos: stagePos.get(a.stage_id as string) ?? 999,
        changed: (a.status_changed_at as string | null) ?? "",
      }))
      .sort((a, b) => a.pos - b.pos || b.changed.localeCompare(a.changed));
    navTotal = ordered.length;
    const idx = ordered.findIndex((o) => o.appId === sp.app);
    navIndex = idx + 1;
    const mk = (o: { candidateId: string; appId: string }) =>
      `/portal/${slug}/c/${o.candidateId}?app=${o.appId}`;
    if (idx > 0) prevHref = mk(ordered[idx - 1]);
    if (idx >= 0 && idx < ordered.length - 1) nextHref = mk(ordered[idx + 1]);
  }

  return (
    <>
      <PortalHeader
        slug={slug}
        companyName={company?.name ?? null}
        companyLogoUrl={company?.logo_url ?? null}
        jobTitle={(job?.title as string) ?? ""}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t("portal.backToJobs")}
          </Link>
          {/* Page through the pipeline without returning to the board. */}
          {navTotal > 1 ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {prevHref ? (
                <Link
                  href={prevHref}
                  aria-label={t("candidatesArea.navPrev")}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-foreground/5"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border opacity-40">
                  <ChevronLeft className="h-4 w-4" />
                </span>
              )}
              <span className="px-1 tabular-nums">
                {navIndex} / {navTotal}
              </span>
              {nextHref ? (
                <Link
                  href={nextHref}
                  aria-label={t("candidatesArea.navNext")}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-foreground/5"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border opacity-40">
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </div>
          ) : null}
        </div>

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
            {showCv && cvUrl ? (
              <a
                href={cvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-foreground/5"
              >
                <Download className="h-3 w-3" /> {t("portal.cv")}
              </a>
            ) : null}
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

        {/* Candidate Report — recruiter-authored summary, top of the
            page so the client sees the "why this person" first. */}
        {(candidate as { candidate_report?: string | null }).candidate_report ? (
          <section className="mt-5 rounded-md border border-border bg-bg-2 px-4 py-3">
            <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("candidatesArea.candidateReportTitle")}
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {(candidate as { candidate_report?: string | null }).candidate_report}
            </p>
          </section>
        ) : null}

        {/* CV Profile — identical layout to the internal candidate
            detail view: summary collapse → tenure stats → experience
            (with logos + descriptions) → education. */}
        <section className="mt-5 rounded-md border border-border bg-bg-2 px-4 py-3">
          <h2 className="mb-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("candidatesArea.tabCvProfile")}
          </h2>
          <ParsedProfileSection profile={profile} t={t} />
        </section>

        {/* Comments */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold">{t("portal.commentsTitle")}</h2>
          <PortalCommentsThread comments={comments} t={t} />
          {allowFeedback ? (
            <PortalCommentForm slug={slug} applicationId={sp.app} />
          ) : null}
        </section>
      </main>
      <PortalRealtime />
    </>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}
