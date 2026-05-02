import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, Mail } from "lucide-react";
import { LinkedinIcon } from "@/components/icons/linkedin-icon";
import {
  getSupabaseAdmin,
  type CandidateCacheRow,
  type PortalLinkRow,
} from "@/lib/supabase";
import {
  getCandidateAttachments,
  type ManatalAttachment,
} from "@/lib/manatal";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StageBadge } from "@/components/stage-badge";
import { ReportBody } from "@/components/report-body";
import { CandidateNav } from "@/components/candidate-nav";
import { NotesPanel } from "@/components/notes-panel";
import { PortalDisabled } from "@/components/portal-disabled";
import { sanitizeReportHtml } from "@/lib/report-html";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Props = { params: Promise<{ slug: string; candidateSlug: string }> };

export default async function CandidatePage({ params }: Props) {
  const { slug, candidateSlug } = await params;
  const supabase = getSupabaseAdmin();

  const { data: portalLink, error: linkErr } = await supabase
    .from("portal_links")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (linkErr || !portalLink) notFound();
  const link = portalLink as PortalLinkRow;
  const expired = link.expires_at && new Date(link.expires_at) < new Date();
  if (!link.is_active || expired) {
    return <PortalDisabled />;
  }

  const { data: candRow, error: candErr } = await supabase
    .from("candidate_cache")
    .select("*")
    .eq("manatal_job_id", link.manatal_job_id)
    .eq("candidate_slug", candidateSlug)
    .eq("is_active_match", true)
    .maybeSingle();

  if (candErr || !candRow) notFound();
  const c = candRow as CandidateCacheRow;

  // Fetch the ordered slug list for prev/next nav. Same ordering as the
  // pipeline table: stage_rank desc nulls last, then name asc.
  const { data: siblings } = await supabase
    .from("candidate_cache")
    .select("candidate_slug, candidate_full_name")
    .eq("manatal_job_id", link.manatal_job_id)
    .eq("is_active_match", true)
    .order("stage_rank", { ascending: false, nullsFirst: false })
    .order("candidate_full_name", { ascending: true });
  const ordered = (siblings ?? []) as Array<{
    candidate_slug: string;
    candidate_full_name: string;
  }>;
  const idx = ordered.findIndex((s) => s.candidate_slug === candidateSlug);
  const prev =
    idx > 0
      ? { slug: ordered[idx - 1].candidate_slug, name: ordered[idx - 1].candidate_full_name }
      : null;
  const next =
    idx >= 0 && idx < ordered.length - 1
      ? { slug: ordered[idx + 1].candidate_slug, name: ordered[idx + 1].candidate_full_name }
      : null;

  const subtitle = [c.current_position, c.current_company]
    .filter((s): s is string => Boolean(s))
    .join(" @ ");
  const reportHtml = c.candidate_report_html
    ? sanitizeReportHtml(c.candidate_report_html)
    : null;
  const hasContent = Boolean(reportHtml || (c.description && c.description.trim()));

  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-6">
          <Link
            href={`/p/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to pipeline
          </Link>
          <Image
            src="/talental-logo.svg"
            alt="Talental"
            width={120}
            height={24}
            className="h-5 w-auto opacity-80"
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {/* Breadcrumb + prev/next */}
        <div className="mb-2 flex items-center justify-between gap-3">
          {link.client_display_name || link.manatal_job_position_name ? (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {[link.client_display_name, link.manatal_job_position_name]
                .filter((s): s is string => Boolean(s))
                .join(" · ")}
            </p>
          ) : (
            <span />
          )}
          <CandidateNav portalSlug={slug} prev={prev} next={next} />
        </div>

        {/* Identity row */}
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {c.candidate_full_name}
          </h1>
          <StageBadge stage={c.stage_name} />
        </div>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {c.linkedin_url ? (
            <a
              href={c.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <LinkedinIcon size={16} />
              LinkedIn
            </a>
          ) : null}
          {c.email ? (
            <a
              href={`mailto:${c.email}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Mail className="h-4 w-4" />
              {c.email}
            </a>
          ) : null}
        </div>

        {/* Two-column main: report on left, resume preview on right.
            Stacks on narrow screens. */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Candidate report
            </h2>
            {reportHtml ? (
              <ReportBody html={reportHtml} className="max-w-none" />
            ) : c.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {c.description}
              </p>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
                <h3 className="text-base font-semibold text-foreground">
                  No detailed report yet
                </h3>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
                  Talental hasn&apos;t finished writing a detailed report for
                  this candidate. Reach out to your Talental partner for more
                  context.
                </p>
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Resume
              </h2>
              {c.has_resume ? (
                <a
                  href={`/api/files/resume/${c.manatal_candidate_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Open in new tab"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Open
                </a>
              ) : null}
            </div>
            {c.has_resume ? (
              <iframe
                src={`/api/files/resume/${c.manatal_candidate_id}#toolbar=1&navpanes=0&view=FitH`}
                title={`Resume for ${c.candidate_full_name}`}
                className="h-[80vh] min-h-[600px] w-full rounded-lg border border-border bg-background"
              />
            ) : (
              <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No resume on file for this candidate yet.
                </p>
              </div>
            )}
          </section>
        </div>

        <Suspense fallback={<SectionLoading title="Attachments" />}>
          <AttachmentsSection candidateId={c.manatal_candidate_id} />
        </Suspense>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Notes
          </h2>
          <NotesPanel
            portalSlug={slug}
            candidateSlug={candidateSlug}
            layout="inline"
          />
        </section>

        {!hasContent && !c.has_resume ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            More information will appear here as Talental progresses with this
            candidate.
          </p>
        ) : null}
      </main>
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-6 py-6 text-xs text-muted-foreground">
          Powered by{" "}
          <a
            href="https://talental.mx"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 font-medium text-brand hover:underline"
          >
            Talental
          </a>
        </div>
      </footer>
    </>
  );
}

async function AttachmentsSection({ candidateId }: { candidateId: number }) {
  const items = await getCandidateAttachments(candidateId).catch(
    () => [] as ManatalAttachment[],
  );
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Attachments
      </h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((a) => (
          <li key={a.id}>
            <a
              href={`/api/files/attachment/${candidateId}/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-brand hover:underline"
            >
              <FileDown className="h-3.5 w-3.5" />
              {a.name || a.file_name || `Attachment ${a.id}`}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionLoading({ title }: { title: string }) {
  return (
    <section className="mt-8" aria-busy="true">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <Skeleton className="h-16 w-full" />
    </section>
  );
}
