import { notFound } from "next/navigation";
import { resolvePortalToken } from "@/lib/portal/resolve-token";
import { readPortalSession } from "@/lib/portal/session";
import { tokenCanSeeJob } from "@/lib/portal/access";
import { loadPortalPipeline } from "@/lib/portal/load-pipeline";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CompanyRow } from "@/lib/hiring";
import { EmailGate } from "../../_components/email-gate";
import { PortalHeader } from "../../_components/portal-header";
import { PortalKanban } from "../../_components/portal-kanban";
import { PortalInvalid } from "../../_components/portal-invalid";

export const dynamic = "force-dynamic";

export default async function PortalJobPage({
  params,
}: {
  params: Promise<{ slug: string; jobId: string }>;
}) {
  const { slug, jobId } = await params;
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

  if (!(await tokenCanSeeJob(token, jobId))) return notFound();
  const pipeline = await loadPortalPipeline(jobId, token.workspace_id);
  if (!pipeline) return notFound();

  const sb = getSupabaseAdmin();
  let company: CompanyRow | null = null;
  if (pipeline.job.company_id) {
    const { data } = await sb
      .schema("hiring")
      .from("companies")
      .select("*")
      .eq("id", pipeline.job.company_id)
      .maybeSingle();
    company = (data as CompanyRow | null) ?? null;
  }

  return (
    <>
      <PortalHeader
        slug={slug}
        companyName={company?.name ?? null}
        companyLogoUrl={company?.logo_url ?? null}
        jobTitle={pipeline.job.title ?? ""}
        showBackLink={token.scope === "company"}
      />
      <PortalKanban
        slug={slug}
        pipeline={pipeline}
        viewerEmail={session.email}
      />
    </>
  );
}
