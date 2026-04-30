import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSupabaseAdmin, type PortalLinkRow } from "@/lib/supabase";
import { PortalHeader } from "@/components/portal-header";
import { CandidatesList } from "./_components/candidates-list";
import { CandidatesLoading } from "./_components/candidates-loading";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Props = { params: Promise<{ slug: string }> };

export default async function PortalPage({ params }: Props) {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();

  const { data: link, error } = await supabase
    .from("portal_links")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !link) notFound();
  const portalLink = link as PortalLinkRow;

  if (portalLink.expires_at && new Date(portalLink.expires_at) < new Date()) {
    notFound();
  }

  // fire-and-forget last_viewed_at update
  supabase
    .from("portal_links")
    .update({ last_viewed_at: new Date().toISOString() })
    .eq("id", portalLink.id)
    .then(() => {});

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
        <Suspense fallback={<CandidatesLoading />}>
          <CandidatesList
            jobId={portalLink.manatal_job_id}
            portalSlug={portalLink.slug}
          />
        </Suspense>
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
