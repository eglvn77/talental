import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { JobNavControls } from "./_components/job-nav-controls";
import {
  hiring,
  type CompanyRow,
  type JobRow,
  type JobStatusRow,
} from "@/lib/hiring";
import { formatSalaryRange } from "@/lib/format";
import { loadJobStatuses } from "@/lib/job-status";
import { loadCustomFieldsForEntity } from "@/lib/custom-fields";
import { NotificationDot } from "@/components/ui/notification-dot";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import {
  loadJobRoleConfig,
  loadRequiredJobCustomFieldsMissing,
} from "@/lib/kickoff/role-config";
import { JobStatusSelect } from "../status-select";
import { AddCandidateMenu } from "./add-candidate-menu";
import { JobTabs } from "./job-tabs";
import { KickoffButton } from "./kickoff-button";
import { JobHeaderMenu } from "./_components/job-header-menu";

export const dynamic = "force-dynamic";

export default async function JobLayout({
  params,
  children,
}: {
  params: Promise<{ jobId: string }>;
  children: React.ReactNode;
}) {
  const { jobId } = await params;
  const t = await getT();
  // First wave — three independent reads that don't need each other.
  // getCurrentUser is React-cached so the layout/page consumers don't
  // re-fetch; running it inside Promise.all here trims one wall-clock
  // round-trip vs the previous serial chain.
  const [me, db, jobStatuses] = await Promise.all([
    getCurrentUser(),
    hiring(),
    loadJobStatuses(),
  ]);
  const userIsAdmin = me ? isAdmin(me.team_member) : false;

  const { data: jobData } = await db
    .from("jobs")
    .select("*, status:job_statuses(*)")
    .eq("id", jobId)
    .maybeSingle();
  if (!jobData) notFound();
  const job = jobData as JobRow & { status: JobStatusRow | null };

  // Second wave — everything that depends on the resolved job, but
  // not on each other. Used to be five serial awaits; now one
  // Promise.all so the layout blocks for the slowest leg, not the
  // sum. Custom-fields bundle is loaded once and shared between the
  // two kickoff helpers (was 2 reads, now 1) — see role-config.ts.
  const [
    { data: companyData },
    jobCustomFields,
    { count: pendingReviewCount },
    { data: kickoffPromptRows },
  ] = await Promise.all([
    job.company_id
      ? db
          .from("companies")
          .select("*")
          .eq("id", job.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    loadCustomFieldsForEntity("job", job.id),
    db
      .from("applications")
      .select("id", { head: true, count: "exact" })
      .eq("job_id", job.id)
      .is("reviewed_at", null)
      .eq("source", "careers"),
    db
      .from("prompts")
      .select("key, label, is_default")
      .eq("category", "kickoff")
      .order("is_default", { ascending: false })
      .order("label", { ascending: true }),
  ]);
  const kickoffPrompts = (kickoffPromptRows ?? []) as Array<{
    key: string;
    label: string;
    is_default: boolean;
  }>;
  const company = (companyData ?? null) as CompanyRow | null;
  const roleConfig = await loadJobRoleConfig(job, jobCustomFields);
  const missingRequiredCustomFields = await loadRequiredJobCustomFieldsMissing(
    job.id,
    jobCustomFields,
  );

  // The "open public posting" affordance — visible when the careers
  // route would actually return the vacante. Mirrors the gate the
  // careers RPCs use (is_open=true AND publication_status != draft).
  const isPubliclyVisible =
    job.status?.is_open === true && job.publication_status !== "draft";
  const publicHref = isPubliclyVisible
    ? `/careers/${me?.workspace.slug}/${job.slug}`
    : null;

  return (
    // Layout-driven height instead of `h-[calc(100vh-280px)]` magic
    // numbers. The page is a flex column that fills the main area
    // below the global top bar; the header is normal flow (flex-none),
    // and {children} get the remaining space via flex-1 + min-h-0 so
    // pages (kanban / list / paquete / posting) handle their own
    // internal scrolling. No coupling between header height and board
    // height.
    //
    // Header rhythm (8pt scale):
    //   pt-8         → 32px from top bar bottom to pagination row
    //   nav mb-4     → 16px pagination → title group
    //   subtitle mt-1 → 4px tight (one identity)
    //   title mb-6   → 24px title group → tabs (clear break)
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-6 pt-8">
      <div>
        {/* Back link + prev/next nav (← / → keyboard support).
            The siblings come from the sessionStorage stash that the
            jobs table writes on row click — direct hits / shared URLs
            get just the back arrow. */}
        <div className="mb-4">
          <JobNavControls jobId={job.id} />
        </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold">
              {job.title || t("jobsList.untitledJob")}
            </h1>
            <NotificationDot count={pendingReviewCount ?? 0} size="lg" />
            <JobStatusSelect
              jobId={job.id}
              jobTitle={job.title || undefined}
              currentStatusId={job.status_id}
              statuses={jobStatuses}
            />
          </div>
          {/* Subtitle line: ubicación · salario · empresa.
              Empresa used to live as a chip up in the title row but
              that mixed two chip styles (status pill + company chip)
              in the same line and threw the visual balance off. Moved
              here so the title row reads as a single object (titulo +
              status), matched on the right by the icon-only action
              cluster. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {[
              job.location,
              formatSalaryRange(
                job.salary_min,
                job.salary_max,
                job.salary_currency,
                // bruto/neto is internal info — hide from the job
                // header so a screen-share with the client doesn't
                // leak the designation.
                null,
                job.salary_frequency,
              ),
            ]
              .filter(Boolean)
              .map((bit, i, arr) => (
                <span key={i}>
                  {bit}
                  {i < arr.length - 1 || company ? (
                    <span className="ml-1.5 text-fg-muted/60">·</span>
                  ) : null}
                </span>
              ))}
            {company ? (
              // Relative `?company=` so the global slideover host
              // opens the profile in place; we stay on the vacante.
              <Link
                href={`?company=${company.id}`}
                scroll={false}
                className="inline-flex items-center gap-1.5 text-foreground hover:underline"
              >
                <CompanyLogo
                  src={company.logo_url}
                  domain={company.domain}
                  name={company.name}
                  size="sm"
                />
                {company.name}
              </Link>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <KickoffButton
            jobId={job.id}
            roleConfig={roleConfig}
            missingRequiredCustomFields={missingRequiredCustomFields}
            hasContent={Boolean(job.overview)}
            kickoffPrompts={kickoffPrompts}
          />
          <AddCandidateMenu jobId={job.id} />
          {/* Open the public posting in a new tab. Visible only when
              the vacante is actually live publicly so we don't ship a
              link that would 404 the recruiter. Sits to the right of
              the add-candidate button — the share-the-link affordance
              is naturally adjacent to "bring more candidates in". */}
          {publicHref ? (
            <Link
              href={publicHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("jobDetail.viewPublicPosting")}
              title={t("jobDetail.viewPublicPosting")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-1 text-fg-muted transition-colors hover:bg-bg-2 hover:text-fg-1"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          ) : null}
          <JobHeaderMenu
            jobId={job.id}
            title={job.title || t("jobsList.untitledJob")}
            isAlreadyArchived={job.status?.is_archived === true}
            jobStatuses={jobStatuses}
          />
        </div>
      </div>

      {/* Tabs row + actions slot share the same line. The tabs side
          flexes and scrolls horizontally when the viewport narrows;
          the actions slot stays pinned right so Filtros + Vista never
          wrap below or scroll off. JobsView portals its controls into
          #job-tab-actions on mount.
          `min-w-0` on the wrapper is critical — without it the inner
          flex children (the tabs nav) refuse to shrink even with
          their own min-w-0, and the row pushes the page wider than
          the viewport, taking the actions slot out with it. */}
        <div className="flex min-w-0 items-center gap-3 border-b border-border">
          <JobTabs
            jobId={job.id}
            hasKickoff={Boolean(job.overview)}
            isAdmin={userIsAdmin}
          />
          <div
            id="job-tab-actions"
            className="ml-auto flex shrink-0 items-center gap-1.5 py-1.5"
          />
        </div>
      </div>

      {/* Content fills the remaining vertical space. overflow-y-auto
          lets long pages (paquete, posting) scroll internally; pages
          with their own internal layout (kanban with column-level
          overflow) won't reach this scroll since they self-constrain.
          min-h-0 is the flex magic that lets flex-1 children shrink
          smaller than their content. */}
      <div className="mt-4 flex flex-1 min-h-0 flex-col overflow-y-auto pb-12">
        {children}
      </div>
    </div>
  );
}
