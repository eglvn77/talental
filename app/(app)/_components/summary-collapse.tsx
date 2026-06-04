"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Long candidate summaries (LinkedIn "About" or PDF summary block)
 * used to dominate the slideover. Now clamped to 4 lines with a
 * "Ver más" toggle; if the rendered text fits in the clamp the
 * toggle hides itself automatically (no flash on first paint —
 * we measure after mount).
 *
 * Stays client-side because the toggle owns local state.
 */
const DEFAULT_LINES = 8;

export function SummaryCollapse({
  text,
  lines = DEFAULT_LINES,
  size = "sm",
}: {
  text: string;
  lines?: number;
  size?: "xs" | "sm";
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState<boolean>(true);

  const textSize = size === "xs" ? "text-xs" : "text-sm";
  const toggleSize = size === "xs" ? "text-[10px]" : "text-xs";

  return (
    <div className={textSize}>
      <p
        ref={(el) => {
          if (!el) return;
          // After layout, check if the clamped paragraph would
          // overflow its visible height. If not, hide the toggle.
          requestAnimationFrame(() => {
            const wouldOverflow = el.scrollHeight > el.clientHeight + 1;
            if (wouldOverflow !== overflows) setOverflows(wouldOverflow);
          });
        }}
        className="whitespace-pre-wrap text-muted-foreground"
        style={
          !expanded
            ? {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
              }
            : undefined
        }
      >
        {text}
      </p>
      {overflows ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`mt-1.5 inline-flex items-center gap-0.5 font-semibold text-accent hover:underline ${toggleSize}`}
        >
          {expanded ? t("shared.summaryShowLess") : t("shared.summaryShowMore")}
        </button>
      ) : null}
    </div>
  );
}
