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
    return notAvailableHtml("No resume on file for this candidate.", 404);
  }

  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return notAvailableHtml(
      "The resume could not be loaded. Please try again later.",
      502,
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

// When the iframe asks for a resume that's gone (Manatal data changed
// since the last refresh) or transiently unavailable, return a friendly
// HTML page so the iframe shows readable text instead of raw JSON.
function notAvailableHtml(message: string, status: number): Response {
  const body = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Resume unavailable</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;background:#fafafa;
    font-family:Inter,system-ui,-apple-system,sans-serif;color:#6b7280;
    font-size:14px;text-align:center;padding:40px}
</style></head>
<body><p>${escapeHtml(message)}</p></body></html>`;
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
