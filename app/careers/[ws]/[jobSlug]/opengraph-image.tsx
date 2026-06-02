import { ImageResponse } from "next/og";
import {
  loadCareersPublishedJob,
  loadCareersWorkspaceHeader,
} from "../../_lib/data";

export const runtime = "nodejs";
export const alt = "Job posting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Dynamic Open Graph card for the public job posting. Generated once
 * per (ws, jobSlug) and cached by the framework. Wired automatically
 * via the Next.js `opengraph-image` file convention — the
 * `generateMetadata` in [jobSlug]/page.tsx no longer needs to pass an
 * `images` field.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ ws: string; jobSlug: string }>;
}) {
  const { ws, jobSlug } = await params;
  const [header, job] = await Promise.all([
    loadCareersWorkspaceHeader(ws),
    loadCareersPublishedJob(ws, jobSlug),
  ]);

  const title = job?.title ?? "Job opportunity";
  const orgName =
    job?.show_company_in_posting && job?.company_name
      ? job.company_name
      : (header?.name ?? "Talental");
  const location = job?.location ?? null;
  const modality = job?.work_modality ?? null;

  const chips = [modality, location].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, #0b0d12 0%, #1a1f2b 60%, #243042 100%)",
          color: "#ffffff",
          padding: "72px",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "22px",
              color: "#9aa4b2",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "8px",
                background: "#f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#0b0d12",
                fontWeight: 800,
                fontSize: "22px",
              }}
            >
              T
            </div>
            <span>{orgName}</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "1000px",
          }}
        >
          <div
            style={{
              fontSize: title.length > 60 ? "64px" : "84px",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </div>
          {chips ? (
            <div
              style={{
                display: "flex",
                fontSize: "28px",
                color: "#cbd5e1",
              }}
            >
              {chips}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "22px",
            color: "#9aa4b2",
          }}
        >
          <span>talental.mx</span>
          <span style={{ fontWeight: 600, color: "#f59e0b" }}>
            We&apos;re hiring
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
