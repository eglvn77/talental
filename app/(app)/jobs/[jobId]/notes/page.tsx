import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import {
  NotesSection,
  type NoteWithAuthor,
} from "@/app/(app)/_components/notes-section";

export const dynamic = "force-dynamic";

/**
 * /jobs/[id]/notes — workspace-shared notepad attached to the
 * vacante itself (not to a candidate or application).
 *
 * Loads notes with the author's display name + avatar joined in so
 * each card can attribute who wrote it. Delete is admin-only and is
 * resolved server-side so the affordance never shows for recruiters.
 */
export default async function JobNotesPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const me = await getCurrentUser();
  const userIsAdmin = me ? isAdmin(me.team_member) : false;

  const db = await hiring();
  // Supabase's PostgREST embedding follows the FK
  // notes.author_id -> team_members.id. We pull `full_name` and
  // `avatar_url` so the notes section can render the byline + avatar
  // without an extra round-trip per row.
  const { data } = await db
    .from("notes")
    .select("*, author:team_members!notes_author_id_fkey(full_name, avatar_url)")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  const notes = (data ?? []) as NoteWithAuthor[];

  return (
    <div className="mx-auto w-full max-w-3xl py-6">
      <NotesSection
        entityType="job"
        entityId={jobId}
        notes={notes}
        isAdmin={userIsAdmin}
        revalidatePath={`/jobs/${jobId}/notes`}
      />
    </div>
  );
}
