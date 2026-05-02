import { NextResponse } from "next/server";
import {
  extractDownloadUrl,
  getCandidateAttachments,
} from "@/lib/manatal";
import { resolvePortalAndCandidate } from "@/lib/portal-access";

export const dynamic = "force-dynamic";

// Redirects to a fresh signed download URL for the requested attachment.
// Authorization: the attachment must belong to a candidate inside this
// portal's job — direct ID enumeration is blocked.
export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{
      slug: string;
      candidateSlug: string;
      attachmentId: string;
    }>;
  },
) {
  const { slug, candidateSlug, attachmentId } = await params;
  const attId = Number(attachmentId);
  if (!Number.isFinite(attId)) {
    return NextResponse.json({ error: "Invalid attachment id" }, { status: 400 });
  }

  const access = await resolvePortalAndCandidate(slug, candidateSlug);
  if (!access.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachments = await getCandidateAttachments(
    access.candidate.manatal_candidate_id,
  );
  const match = attachments.find((a) => a.id === attId);
  const url = extractDownloadUrl(match);
  if (!url) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }
  return NextResponse.redirect(url);
}
