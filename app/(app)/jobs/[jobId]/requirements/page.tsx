import { notFound } from "next/navigation";
import { hiring, type JobRequirements, type JobRow } from "@/lib/hiring";
import { RequirementsEditor } from "../_components/requirements-editor";
import { EmptyState } from "@/app/(app)/_components/empty-state";

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
        <EmptyState
          title="Aún no hay Requisitos"
          description="Corre el Kickoff con el botón en el header para popular esta sección."
          variant="dashed"
        />
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
