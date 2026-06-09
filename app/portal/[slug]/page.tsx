import { notFound } from "next/navigation";
import { resolvePortalToken } from "@/lib/portal/resolve-token";
import { readPortalSession } from "@/lib/portal/session";
import { jobsForToken } from "@/lib/portal/access";
import { loadPortalPipeline, loadVisibleAppCounts } from "@/lib/portal/load-pipeline";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getT } from "@/lib/i18n/server";
import type { CompanyRow } from "@/lib/hiring";
import { EmailGate } from "./_components/email-gate";
import { PortalHeader } from "./_components/portal-header";
import { PortalKanban } from "./_components/portal-kanban";
import { CompanyJobsGrid } from "./_components/company-jobs-grid";
import { PortalInvalid } from "./_components/portal-invalid";
import { PortalRealtime } from "./_components/portal-realtime";
import { ApplicationSharePage } from "./_components/application-share-page";
import { loadApplicationShare } from "@/lib/portal/load-application-share";

export const dynamic = "force-dynamic";

export default async function PortalEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const token = await resolvePortalToken(slug);
  if (!token) return <PortalInvalid />;

  // Application-scoped share link bypasses the email gate entirely —
  // it's a fully public, anonymous-friendly per-candidate view. The
  // token IS the auth boundary; anyone with the link can view.
  if (token.scope === "application" && token.application_id) {
    const payload = await loadApplicationShare(token.application_id);
    if (!payload) return <PortalInvalid />;
    return (
      <>
        <ApplicationSharePage slug={slug} payload={payload} />
        <PortalFooter />
      </>
    );
  }

  const session = await readPortalSession(token);

  // Resolve company for branding — for job-scope, the job's company;
  // for company-scope, the token's company directly.
  const sb = getSupabaseAdmin();
  let company: CompanyRow | null = null;
  if (token.scope === "company" && token.company_id) {
    const { data } = await sb
      .schema("hiring")
      .from("companies")
      .select("*")
      .eq("id", token.company_id)
      .maybeSingle();
    company = (data as CompanyRow | null) ?? null;
  } else if (token.scope === "job" && token.job_id) {
    const { data: job } = await sb
      .schema("hiring")
      .from("jobs")
      .select("company_id")
      .eq("id", token.job_id)
      .maybeSingle();
    if (job?.company_id) {
      const { data } = await sb
        .schema("hiring")
        .from("companies")
        .select("*")
        .eq("id", job.company_id)
        .maybeSingle();
      company = (data as CompanyRow | null) ?? null;
    }
  }

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6">
        <EmailGate slug={slug} />
      </main>
    );
  }

  // Logged in. Render scope content.
  if (token.scope === "company") {
    const jobs = await jobsForToken(token);
    const counts = await loadVisibleAppCounts(jobs.map((j) => j.id));
    const t = await getT();
    return (
      <>
        <PortalHeader
          slug={slug}
          companyName={company?.name ?? null}
          companyLogoUrl={company?.logo_url ?? null}
        />
        <main className="mx-auto w-full max-w-7xl px-6 py-8">
          <h1 className="text-lg font-semibold">{t("portal.tabLabel")}</h1>
          <CompanyJobsGrid slug={slug} jobs={jobs} counts={counts} />
        </main>
        <PortalRealtime />
        <PortalFooter />
      </>
    );
  }

  // scope = job
  if (!token.job_id) return notFound();
  const pipeline = await loadPortalPipeline(
    token.job_id,
    token.workspace_id,
  );
  if (!pipeline) return notFound();
  return (
    <>
      <PortalHeader
        slug={slug}
        companyName={company?.name ?? null}
        companyLogoUrl={company?.logo_url ?? null}
        jobTitle={pipeline.job.title ?? ""}
      />
      <PortalKanban
        slug={slug}
        pipeline={pipeline}
        viewerEmail={session.email}
      />
      <PortalRealtime />
      <PortalFooter />
    </>
  );
}

async function PortalFooter() {
  const t = await getT();
  return (
    <footer className="mt-auto border-t border-border py-3 text-center text-[10px] text-muted-foreground">
      {t("portal.poweredBy")}
    </footer>
  );
}
