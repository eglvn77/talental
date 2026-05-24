import Link from "next/link";
import { notFound } from "next/navigation";
import { hiring, type CompanyRow, type JobRow } from "@/lib/hiring";
import { formatSalaryRange } from "@/lib/format";
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
  const db = await hiring();

  const { data: jobData } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (!jobData) notFound();
  const job = jobData as JobRow;

  const { data: companyData } = job.company_id
    ? await db
        .from("companies")
        .select("*")
        .eq("id", job.company_id)
        .maybeSingle()
    : { data: null };
  const company = (companyData ?? null) as CompanyRow | null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <Link
          href="/jobs"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Vacantes
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold">{job.title}</h1>
            <JobStatusSelect jobId={job.id} current={job.status} />
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
                job.salary_type,
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
              <Link
                href={`/companies?company=${company.id}`}
                className="text-foreground hover:underline"
              >
                {company.name}
              </Link>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <KickoffButton
            jobId={job.id}
            initialRoleType={job.role_type}
            initialAssessmentLink={job.assessment_link}
            hasContent={Boolean(job.overview)}
          />
          <AddCandidateMenu jobId={job.id} />
          <JobHeaderMenu
            jobId={job.id}
            title={job.title}
            isAlreadyArchived={job.status === "cubierta"}
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
        <JobTabs jobId={job.id} hasKickoff={Boolean(job.overview)} />
        <div
          id="job-tab-actions"
          className="ml-auto flex shrink-0 items-center gap-1.5 py-1.5"
        />
      </div>

      <div className="mt-2">{children}</div>
    </div>
  );
}
