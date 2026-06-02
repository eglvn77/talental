import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import {
  loadCareersPublishedJob,
  loadCareersWorkspaceHeader,
} from "../../_lib/data";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const alt = "Talental — job opportunity";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Dynamic Open Graph card for the public job posting. 1200×630 in the
 * Talental brand palette (bone canvas, ink type, olive accent) with
 * the Talental wordmark. The job title + modality/location come from
 * the same RPCs as the posting page. Wired automatically via the
 * Next.js `opengraph-image` file convention.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ ws: string; jobSlug: string }>;
}) {
  const { ws, jobSlug } = await params;
  const [header, job, t] = await Promise.all([
    loadCareersWorkspaceHeader(ws),
    loadCareersPublishedJob(ws, jobSlug),
    getT(),
  ]);

  const title = job?.title ?? "Job opportunity";
  const location = job?.location ?? null;
  const modalityRaw = job?.work_modality ?? null;
  const modalityKeys = new Set(["remote", "hybrid", "onsite"]);
  const modality = modalityRaw
    ? modalityKeys.has(modalityRaw)
      ? t(`careers.modality.${modalityRaw}`)
      : modalityRaw
    : null;
  const chips = [modality, location].filter(Boolean).join(" · ");

  // Inline the Talental wordmark as a data URL so ImageResponse can
  // render it without a network fetch. The SVG already uses brand
  // hex values (#1C1B16 ink + #5C6B3F olive dot).
  const wordmarkPath = path.join(
    process.cwd(),
    "public/brand/svg/talental-wordmark.svg",
  );
  const wordmarkSvg = await readFile(wordmarkPath, "utf8");
  const wordmarkDataUrl = `data:image/svg+xml;base64,${Buffer.from(
    wordmarkSvg,
  ).toString("base64")}`;

  // Brand palette (from app/globals.css).
  const BONE = "#EFE9DB";
  const INK = "#1C1B16";
  const OLIVE = "#5C6B3F";
  const FG_MUTED = "#807866";
  const BORDER = "#C9BFA5";

  void header;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BONE,
          color: INK,
          padding: "72px",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        {/* Top: Talental wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={wordmarkDataUrl}
            alt="Talental"
            width={260}
            height={77}
            style={{ display: "block" }}
          />
        </div>

        {/* Middle: job title + chips */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            maxWidth: "1050px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "22px",
              color: OLIVE,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "9999px",
                  background: OLIVE,
                  display: "block",
                }}
              />
              <span>Now hiring</span>
            </span>
          </div>
          <div
            style={{
              fontSize: title.length > 60 ? "68px" : title.length > 30 ? "84px" : "96px",
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              color: INK,
            }}
          >
            {title}
          </div>
          {chips ? (
            <div
              style={{
                display: "flex",
                fontSize: "30px",
                color: FG_MUTED,
                fontWeight: 500,
              }}
            >
              {chips}
            </div>
          ) : null}
        </div>

        {/* Bottom: thin olive rule + footer */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div
            style={{
              height: "2px",
              background: BORDER,
              display: "block",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "22px",
              color: FG_MUTED,
              letterSpacing: "0.04em",
            }}
          >
            <span>talental.mx</span>
            <span style={{ color: OLIVE, fontWeight: 600 }}>
              Apply now
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
