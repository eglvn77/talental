import { NextResponse } from "next/server";
import { getCandidateAttachments } from "@/lib/manatal";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const id = Number(candidateId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid candidate id" }, { status: 400 });
  }
  const attachments = await getCandidateAttachments(id);
  return NextResponse.json({
    attachments: attachments.map((a) => ({
      id: a.id,
      name: a.name || a.file_name || `Attachment ${a.id}`,
    })),
  });
}
