import { NextResponse } from "next/server";
import { extractDownloadUrl, getCandidateAttachments } from "@/lib/manatal";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ candidateId: string; attachmentId: string }> },
) {
  const { candidateId, attachmentId } = await params;
  const candId = Number(candidateId);
  const attId = Number(attachmentId);
  if (!Number.isFinite(candId) || !Number.isFinite(attId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const attachments = await getCandidateAttachments(candId);
  const match = attachments.find((a) => a.id === attId);
  const url = extractDownloadUrl(match);
  if (!url) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }
  return NextResponse.redirect(url);
}
