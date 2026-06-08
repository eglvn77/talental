import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { canonicalizeLinkedinUrl } from "@/lib/linkedin";
import { SlimAddPanel } from "./_components/slim-add-panel";
import { SlimHeader } from "./_components/slim-header";
import { SlimApplications } from "./_components/slim-applications";
import { SlimTranscripts } from "./_components/slim-transcripts";
import { SlimNotes } from "./_components/slim-notes";
import { SlimActivity } from "./_components/slim-activity";

export const dynamic = "force-dynamic";

/**
 * Slim candidate view designed for ~400px width — the target page
 * loaded inside the Chrome Side Panel iframe when the recruiter
 * has a LinkedIn /in/<slug> tab open.
 *
 * URL: /extension/candidate-view?url=<linkedin-profile-url>
 *
 * Flow:
 *   - Canonicalize the linkedin_url
 *   - Look up candidate in workspace
 *   - If exists: render Header + Applications + Transcripts + Notes + Activity
 *   - If not: render add panel (button + optional job picker)
 *   - If no auth: redirect to /login (renders fine in iframe)
 */
export default async function CandidateViewPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const sp = await searchParams;
  const rawUrl = sp.url ?? "";
  const url = canonicalizeLinkedinUrl(rawUrl);

  if (!url) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        Abre un perfil de LinkedIn (linkedin.com/in/…) y la extensión
        cargará el candidato aquí.
      </div>
    );
  }

  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();

  // Look up candidate. Single round trip; the rest fans out only
  // when we find one.
  const { data: candidate } = await db
    .from("candidates")
    .select(
      "id, full_name, headline, current_position, current_company_name, location, profile_picture_url, linkedin_url, email, enrichment_status, enriched_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("linkedin_url", url)
    .maybeSingle();

  if (!candidate) {
    // Not in base — render the slim add panel.
    return <SlimAddPanel url={url} />;
  }

  const candidateId = (candidate as { id: string }).id;

  // Fan out the related queries in parallel — none depend on each
  // other and we don't want to make the panel feel sluggish.
  const [
    { data: apps },
    { data: transcripts },
    { data: notes },
    { data: stageChanges },
  ] = await Promise.all([
    db
      .from("applications")
      .select(
        "id, job_id, stage_id, created_at, status_changed_at, job:jobs(id, title), stage:pipeline_stages(id, name, color)",
      )
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false }),
    db
      .from("interview_transcripts")
      .select("id, application_id, source, title, recorded_at")
      .eq("candidate_id", candidateId)
      .order("recorded_at", { ascending: false })
      .limit(8),
    db
      .from("notes")
      .select(
        "id, body, created_at, author_id, author:team_members!notes_author_id_fkey(id, full_name)",
      )
      .eq("entity_type", "candidate")
      .eq("entity_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("application_events")
      .select("id, application_id, event_type, payload, created_at")
      .in(
        "application_id",
        (
          await db
            .from("applications")
            .select("id")
            .eq("candidate_id", candidateId)
        ).data?.map((a) => (a as { id: string }).id) ?? [],
      )
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // The companies + jobs list for the "Add to job" dropdown.
  const { data: openJobs } = await db
    .from("jobs")
    .select("id, title, company:companies(name)")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  type Application = {
    id: string;
    job_id: string;
    stage_id: string;
    created_at: string;
    status_changed_at: string | null;
    job: { id: string; title: string } | Array<{ id: string; title: string }> | null;
    stage:
      | { id: string; name: string; color: string | null }
      | Array<{ id: string; name: string; color: string | null }>
      | null;
  };

  const normApps = ((apps ?? []) as Application[]).map((a) => {
    const job = Array.isArray(a.job) ? a.job[0] : a.job;
    const stage = Array.isArray(a.stage) ? a.stage[0] : a.stage;
    return {
      id: a.id,
      jobId: a.job_id,
      jobTitle: job?.title ?? "(sin título)",
      stageId: a.stage_id,
      stageName: stage?.name ?? "(stage)",
      stageColor: stage?.color ?? null,
      createdAt: a.created_at,
    };
  });

  type JobOption = {
    id: string;
    title: string;
    company: { name: string } | Array<{ name: string }> | null;
  };
  const jobsForDropdown = ((openJobs ?? []) as JobOption[]).map((j) => {
    const c = Array.isArray(j.company) ? j.company[0] : j.company;
    return {
      id: j.id,
      title: j.title,
      companyName: c?.name ?? null,
    };
  });

  return (
    <div className="flex min-h-screen flex-col">
      <SlimHeader
        candidateId={candidateId}
        fullName={(candidate.full_name as string) || "(sin nombre)"}
        headline={(candidate.headline as string | null) ?? null}
        currentPosition={(candidate.current_position as string | null) ?? null}
        currentCompany={
          (candidate.current_company_name as string | null) ?? null
        }
        location={(candidate.location as string | null) ?? null}
        profilePictureUrl={
          (candidate.profile_picture_url as string | null) ?? null
        }
        linkedinUrl={url}
        enrichmentStatus={
          (candidate.enrichment_status as string | null) ?? null
        }
        enrichedAt={(candidate.enriched_at as string | null) ?? null}
      />
      <div className="flex-1 space-y-4 px-4 py-4">
        <SlimApplications
          candidateId={candidateId}
          applications={normApps}
          jobs={jobsForDropdown}
        />
        <SlimTranscripts
          transcripts={
            (transcripts ?? []) as Array<{
              id: string;
              application_id: string | null;
              source: string;
              title: string;
              recorded_at: string;
            }>
          }
        />
        <SlimNotes
          candidateId={candidateId}
          notes={
            (notes ?? []) as Array<{
              id: string;
              body: string;
              created_at: string;
              author: { full_name: string } | Array<{ full_name: string }> | null;
            }>
          }
        />
        <SlimActivity
          events={
            (stageChanges ?? []) as Array<{
              id: string;
              event_type: string;
              payload: Record<string, unknown> | null;
              created_at: string;
            }>
          }
        />
      </div>
    </div>
  );
}
