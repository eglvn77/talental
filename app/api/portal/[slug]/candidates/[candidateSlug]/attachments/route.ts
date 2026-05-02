import { NextResponse } from "next/server";
import { getCandidateAttachments } from "@/lib/manatal";
import { resolvePortalAndCandidate } from "@/lib/portal-access";

export const dynamic = "force-dynamic";

// Lists Manatal attachments for the candidate resolved by slug pair.
// Direct candidate-ID enumeration is blocked — the slug must belong
// to a candidate inside this portal's job.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; candidateSlug: string }> },
) {
  const { slug, candidateSlug } = await params;
  const access = await resolvePortalAndCandidate(slug, candidateSlug);
  if (!access.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachments = await getCandidateAttachments(
    access.candidate.manatal_candidate_id,
  );
  return NextResponse.json({
    attachments: attachments.map((a) => ({
      id: a.id,
      name: a.name || a.file_name || `Attachment ${a.id}`,
    })),
  });
}
