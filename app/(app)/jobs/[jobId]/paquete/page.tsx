import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy redirect — /jobs/[id]/paquete bookmarks land on /resources.
 * The label is now "Recursos" (ES) / "Resources" (EN) end-to-end.
 */
export default async function PaqueteRedirect({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  redirect(`/jobs/${jobId}/resources`);
}
