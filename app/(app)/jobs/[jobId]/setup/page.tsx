import { redirect } from "next/navigation";

/**
 * Legacy /setup route. Was the single "Info" tab, briefly split into
 * Resumen / Requisitos / Búsqueda / Entrevistas, and now folded back
 * into a single "Paquete" tab. Bookmarks land on Paquete.
 */
export default async function SetupRedirect({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  redirect(`/jobs/${jobId}/paquete`);
}
