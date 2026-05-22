import { redirect } from "next/navigation";

export default async function SetupRedirect({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  // The old single "Info" tab has been split into Resumen / Requisitos /
  // Búsqueda y Contacto / Entrevistas. Send anyone who still links to
  // /setup to the new Resumen view.
  redirect(`/jobs/${jobId}/overview`);
}
