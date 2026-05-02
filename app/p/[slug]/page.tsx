import { Suspense } from "react";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { getSupabaseAdmin, type PortalLinkRow } from "@/lib/supabase";
import {
  getCandidateCountersForJob,
  getFreshestSyncedAtForJob,
} from "@/lib/cache";
import { PortalHeader } from "@/components/portal-header";
import { PortalDisabled } from "@/components/portal-disabled";
import { PortalCounters } from "@/components/portal-counters";
import { PortalTabs, type PortalTabKey } from "@/components/portal-tabs";
import {
  PipelineViewToggle,
  type PipelineView,
} from "@/components/pipeline-view-toggle";
import { JobDescriptionView } from "@/components/job-description-view";
import { CandidatesList } from "./_components/candidates-list";
import { CandidatesLoading } from "./_components/candidates-loading";
import { relativeTimeShort } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; view?: string }>;
};

export default async function PortalPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tab, view } = await searchParams;
  const activeTab: PortalTabKey = tab === "jd" ? "jd" : "pipeline";
  const activeView: PipelineView = view === "kanban" ? "kanban" : "table";

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

  const [counters, freshestSyncedAt] = await Promise.all([
    getCandidateCountersForJob(portalLink.manatal_job_id),
    getFreshestSyncedAtForJob(portalLink.manatal_job_id),
  ]);
  const updatedLabel = freshestSyncedAt
    ? relativeTimeShort(freshestSyncedAt)
    : null;

  return (
    <>
      <PortalHeader
        clientName={portalLink.client_display_name}
        positionName={portalLink.manatal_job_position_name}
        organizationName={
          portalLink.manatal_organization_name ?? portalLink.client_display_name
        }
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <PortalCounters counters={counters} />
          {updatedLabel ? (
            <p className="text-xs text-muted-foreground">Updated {updatedLabel}</p>
          ) : null}
        </div>
        <div className="mb-6 flex items-end justify-between gap-4 border-b border-border">
          <PortalTabs portalSlug={portalLink.slug} active={activeTab} />
          {activeTab === "pipeline" ? (
            <PipelineViewToggle
              portalSlug={portalLink.slug}
              active={activeView}
            />
          ) : null}
        </div>

        {activeTab === "jd" ? (
          <JobDescriptionView html={portalLink.job_description} />
        ) : (
          <Suspense fallback={<CandidatesLoading />}>
            <CandidatesList
              jobId={portalLink.manatal_job_id}
              portalSlug={portalLink.slug}
              view={activeView}
            />
          </Suspense>
        )}
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
