import { hiring, type NoteRow } from "@/lib/hiring";
import { NotesSection } from "@/app/(app)/_components/notes-section";

export const dynamic = "force-dynamic";

/**
 * /jobs/[id]/notes — workspace-shared notepad attached to the
 * vacante itself (not to a candidate or application).
 *
 * Reuses the canonical <NotesSection> primitive, just bound to
 * `entityType="job"`. The DB enum already includes `job` so no
 * migration is required.
 *
 * Notes here live alongside the vacante (use them for client
 * conversations, internal calibration notes, escalations, etc.).
 * Per-candidate notes still live in the candidate slideover under
 * `entityType="application"`.
 */
export default async function JobNotesPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const db = await hiring();
  const { data } = await db
    .from("notes")
    .select("*")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  const notes = (data ?? []) as NoteRow[];

  return (
    <div className="mx-auto w-full max-w-3xl py-6">
      <NotesSection
        entityType="job"
        entityId={jobId}
        notes={notes}
        revalidatePath={`/jobs/${jobId}/notes`}
      />
    </div>
  );
}
