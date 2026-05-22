import { notFound } from "next/navigation";
import { hiring, type JobRequirements, type JobRow } from "@/lib/hiring";
import { RequirementsEditor } from "../setup/requirements-editor";

export const dynamic = "force-dynamic";

export default async function JobRequirementsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const db = await hiring();
  const { data } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) notFound();
  const job = data as JobRow;

  if (!job.overview) {
    return (
      <div className="py-10">
        <div className="mx-auto max-w-xl rounded-md border border-dashed border-border bg-card px-6 py-10 text-center">
          <h2 className="text-base font-semibold">Aún no hay Requisitos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Corre el Kickoff con el botón en el header para popular esta
            sección.
          </p>
        </div>
      </div>
    );
  }

  const requirements = (job.requirements ?? { must: [], nice: [] }) as JobRequirements;

  return (
    <div className="py-4">
      <section className="rounded-md border border-border bg-card p-4">
        <RequirementsEditor jobId={job.id} initial={requirements} />
      </section>
    </div>
  );
}
