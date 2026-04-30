import { NextResponse } from "next/server";
import { getCandidate } from "@/lib/manatal";

export const dynamic = "force-dynamic";

// Streams the PDF inline through our origin, so the detail page can embed
// it in an <iframe> and the browser renders it without forcing a download.
// Manatal's /candidates/{id}/resume/ endpoint returns 404 for everyone we've
// tested; the real download URL lives at candidate.resume on the detail
// response (short-lived, ~few hours), so we re-resolve on every hit.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const id = Number(candidateId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid candidate id" }, { status: 400 });
  }

  const candidate = await getCandidate(id).catch(() => null);
  const url = typeof candidate?.resume === "string" ? candidate.resume.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "No resume on file" }, { status: 404 });
  }

  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  const filename = filenameFromUrl(url);
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").pop() ?? "");
    return last || "resume.pdf";
  } catch {
    return "resume.pdf";
  }
}
