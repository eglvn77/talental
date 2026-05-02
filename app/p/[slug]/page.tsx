import { Suspense } from "react";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { getSupabaseAdmin, type PortalLinkRow } from "@/lib/supabase";
import { getCandidateCountersForJob } from "@/lib/cache";
import { PortalHeader } from "@/components/portal-header";
import { PortalDisabled } from "@/components/portal-disabled";
import { PortalCounters } from "@/components/portal-counters";
import { PortalTabs, type PortalTabKey } from "@/components/portal-tabs";
import { JobDescriptionView } from "@/components/job-description-view";
import { CandidatesList } from "./_components/candidates-list";
import { CandidatesLoading } from "./_components/candidates-loading";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function PortalPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const activeTab: PortalTabKey = tab === "jd" ? "jd" : "pipeline";

  const supabase = getSupabaseAdmin();

  const { data: link, error } = await supabase
    .from("portal_links")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !link) notFound();
  const portalLink = link as PortalLinkRow;

  const expired =
    portalLink.expires_at && new Date(portalLink.expires_at) < new Date();
  if (!portalLink.is_active || expired) {
    return <PortalDisabled />;
  }

  // Background last_viewed_at update — runs after the response is flushed
  // (Vercel keeps the lambda alive via waitUntil), so it can't be cut off
  // mid-flight or race the page render.
  after(async () => {
    try {
      await supabase
        .from("portal_links")
        .update({ last_viewed_at: new Date().toISOString() })
        .eq("id", portalLink.id);
    } catch (err) {
      console.error("[portal] last_viewed_at update failed", err);
    }
  });

  const counters = await getCandidateCountersForJob(portalLink.manatal_job_id);

  return (
    <>
      <PortalHeader
        clientName={portalLink.client_display_name}
        positionName={portalLink.manatal_job_position_name}
        organizationName={
          portalLink.manatal_organization_name ?? portalLink.client_display_name
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="mb-4">
          <PortalCounters counters={counters} />
        </div>
        <div className="mb-6">
          <PortalTabs portalSlug={portalLink.slug} active={activeTab} />
        </div>

        {activeTab === "jd" ? (
          <JobDescriptionView html={portalLink.job_description} />
        ) : (
          <Suspense fallback={<CandidatesLoading />}>
            <CandidatesList
              jobId={portalLink.manatal_job_id}
              portalSlug={portalLink.slug}
            />
          </Suspense>
        )}
      </main>
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-6 py-6 text-xs text-muted-foreground">
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
