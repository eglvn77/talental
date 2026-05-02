import { getCandidate } from "@/lib/manatal";
import { resolvePortalAndCandidate } from "@/lib/portal-access";

export const dynamic = "force-dynamic";

// Streams the candidate's resume PDF inline through our origin so the
// detail page can embed it in an <iframe> without forcing a download.
//
// Authorization: the portal slug + candidate slug must resolve to a
// candidate within that portal's job. Direct candidate-ID enumeration
// from other portals is blocked.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; candidateSlug: string }> },
) {
  const { slug, candidateSlug } = await params;
  const access = await resolvePortalAndCandidate(slug, candidateSlug);
  if (!access.ok) {
    // Don't leak whether it was the portal or the candidate that failed.
    return notAvailableHtml("No resume on file for this candidate.", 404);
  }

  const candidateId = access.candidate.manatal_candidate_id;
  const candidate = await getCandidate(candidateId).catch(() => null);
  const url =
    typeof candidate?.resume === "string" ? candidate.resume.trim() : "";
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

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").pop() ?? "");
    return last || "resume.pdf";
  } catch {
    return "resume.pdf";
  }
}

// When the iframe asks for a resume that's gone or unavailable, return a
// friendly HTML page so the iframe shows readable text instead of raw JSON.
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

