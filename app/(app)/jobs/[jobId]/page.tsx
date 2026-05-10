import {
  hiring,
  type ApplicationEventRow,
  type ApplicationRow,
  type CandidateRow,
  type NoteRow,
  type PipelineStageRow,
  type TagRow,
} from "@/lib/hiring";
import { PipelineBoard } from "./pipeline-board";
import { CandidateSlideover } from "./candidate-slideover";

export const dynamic = "force-dynamic";

export default async function TrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ contact?: string }>;
}) {
  const { jobId: roleId } = await params;
  const { contact: contactAppId } = await searchParams;
  const db = hiring();

  const [{ data: stagesData }, { data: appsData }] = await Promise.all([
    db
      .from("pipeline_stages")
      .select("*")
      .eq("role_id", roleId)
      .order("position", { ascending: true }),
    db
      .from("applications")
      .select("*")
      .eq("role_id", roleId)
      .order("applied_at", { ascending: false }),
  ]);
  const stages = (stagesData ?? []) as PipelineStageRow[];
  const apps = (appsData ?? []) as ApplicationRow[];

  const candidatesById: Record<string, CandidateRow> = {};
  if (apps.length > 0) {
    const { data: cands } = await db
      .from("candidates")
      .select("*")
      .in(
        "id",
        apps.map((a) => a.candidate_id),
      );
    for (const c of (cands ?? []) as CandidateRow[]) {
      candidatesById[c.id] = c;
    }
  }

  const stagesById: Record<string, PipelineStageRow> = {};
  for (const s of stages) stagesById[s.id] = s;

  // Fetch tags for every application on this board.
  const tagsByApplicationId: Record<string, TagRow[]> = {};
  if (apps.length > 0) {
    const { data: links } = await db
      .from("entity_tags")
      .select("entity_id, tag_id")
      .eq("entity_type", "application")
      .in(
        "entity_id",
        apps.map((a) => a.id),
      );
    const tagIds = Array.from(
      new Set((links ?? []).map((l) => l.tag_id as string)),
    );
    if (tagIds.length > 0) {
      const { data: tagRows } = await db
        .from("tags")
        .select("*")
        .in("id", tagIds);
      const tagsById = new Map<string, TagRow>();
      for (const t of (tagRows ?? []) as TagRow[]) tagsById.set(t.id, t);
      for (const link of (links ?? []) as Array<{
        entity_id: string;
        tag_id: string;
      }>) {
        const tag = tagsById.get(link.tag_id);
        if (!tag) continue;
        (tagsByApplicationId[link.entity_id] ??= []).push(tag);
      }
    }
  }

  const slideoverApp = contactAppId
    ? apps.find((a) => a.id === contactAppId) ?? null
    : null;
  const slideoverCandidate = slideoverApp
    ? candidatesById[slideoverApp.candidate_id] ?? null
    : null;
  const slideoverStage =
    slideoverApp && slideoverApp.stage_id
      ? stagesById[slideoverApp.stage_id] ?? null
      : null;

  let slideoverNotes: NoteRow[] = [];
  let slideoverEvents: ApplicationEventRow[] = [];
  if (slideoverApp) {
    const [{ data: notesData }, { data: eventsData }] = await Promise.all([
      db
        .from("notes")
        .select("*")
        .eq("entity_type", "application")
        .eq("entity_id", slideoverApp.id)
        .order("created_at", { ascending: false }),
      db
        .from("application_events")
        .select("*")
        .eq("application_id", slideoverApp.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    slideoverNotes = (notesData ?? []) as NoteRow[];
    slideoverEvents = (eventsData ?? []) as ApplicationEventRow[];
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-xs text-muted-foreground">
          {apps.length} {apps.length === 1 ? "candidato" : "candidatos"} ·{" "}
          {stages.length} etapas
        </span>
      </div>

      {stages.length === 0 ? (
        <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Esta vacante no tiene etapas configuradas.
        </p>
      ) : (
        <PipelineBoard
          stages={stages}
          applications={apps}
          candidatesById={candidatesById}
          tagsByApplicationId={tagsByApplicationId}
        />
      )}

      {slideoverApp ? (
        <CandidateSlideover
          application={slideoverApp}
          candidate={slideoverCandidate}
          stage={slideoverStage}
          notes={slideoverNotes}
          events={slideoverEvents}
          stagesById={stagesById}
          tags={tagsByApplicationId[slideoverApp.id] ?? []}
          revalidatePath={`/jobs/${roleId}/tracking`}
        />
      ) : null}
    </>
  );
}
