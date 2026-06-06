import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy redirect — the page moved to /jobs/[id]/resources as part of
 * the Paquete → Resources rebuild (Phase 3c-4). Kept for bookmarks
 * and any external links to the old URL. Safe to remove after a
 * soak period confirms no traffic.
 */
export default async function PaqueteRedirect({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  redirect(`/jobs/${jobId}/resources`);
}
