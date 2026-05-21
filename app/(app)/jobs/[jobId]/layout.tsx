import Link from "next/link";
import { notFound } from "next/navigation";
import { hiring, type CompanyRow, type JobRow } from "@/lib/hiring";
import { formatSalaryRange } from "@/lib/format";
import { JobStatusSelect } from "../status-select";
import { AddCandidateMenu } from "./add-candidate-menu";
import { JobTabs } from "./job-tabs";
import { KickoffButton } from "./kickoff-button";

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
            {company ? (
              <Link
                href={`/companies?company=${company.id}`}
                className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
              >
                {company.name}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {[
              job.location,
              formatSalaryRange(
                job.salary_min,
                job.salary_max,
                job.salary_currency,
                job.salary_type,
              ),
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <KickoffButton
            jobId={job.id}
            initialRoleType={job.role_type}
            hasContent={Boolean(job.overview)}
          />
          <AddCandidateMenu jobId={job.id} />
        </div>
      </div>

      <JobTabs jobId={job.id} hasKickoff={Boolean(job.overview)} />

      <div className="mt-2">{children}</div>
    </div>
  );
}
