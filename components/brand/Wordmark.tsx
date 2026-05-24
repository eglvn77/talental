import { cn } from "@/lib/utils";

/**
 * Talental wordmark — the "Talental." lockup.
 *
 * Renders the canonical brand SVG files from `public/brand/svg/`.
 * Two variants only (one per theme):
 *
 *  - light / `default` → `/brand/svg/talental-wordmark.svg`
 *                         (ink letters + olive period)
 *  - dark  / `on-ink`  → `/brand/svg/talental-wordmark-on-ink.svg`
 *                         (bone letters + olive-light period, ink bg)
 *
 * Default behaviour is theme-aware: both files render side by side
 * and CSS hides whichever doesn't belong with the current theme
 * (`data-theme="dark"` or OS dark preference). Browsers cache both
 * after the first paint so the cost is negligible. Passing an
 * explicit `variant` overrides the auto-switch — useful when you
 * need on-ink on a dark hero in light mode (or vice versa).
 *
 * Updates to the master SVGs in `public/brand/svg/` flow into every
 * callsite automatically. Never recolor the letters; never place
 * over photography.
 */

export type WordmarkSize = "sm" | "md" | "lg" | "xl";
export type WordmarkVariant = "default" | "on-ink";

const SIZE_PX: Record<WordmarkSize, number> = {
  sm: 14,
  md: 20,
  lg: 32,
  xl: 56,
};

// Native pixel dimensions of the master SVGs (from their `width` /
// `height` attributes). Used to compute the rendered aspect ratio
// so the image doesn't get distorted.
const NATIVE_W = 796.8;
const NATIVE_H = 236;
const ASPECT = NATIVE_W / NATIVE_H;

const SOURCE: Record<WordmarkVariant, string> = {
  default: "/brand/svg/talental-wordmark.svg",
  "on-ink": "/brand/svg/talental-wordmark-on-ink.svg",
};

export function Wordmark({
  size = "md",
  variant,
  className,
}: {
  size?: WordmarkSize;
  /**
   * Omit to follow the active theme automatically. Pass explicitly
   * to force one variant regardless of theme.
   */
  variant?: WordmarkVariant;
  className?: string;
}) {
  const px = SIZE_PX[size];
  const width = Math.round(px * ASPECT);

  if (variant) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={SOURCE[variant]}
        alt="Talental"
        width={width}
        height={px}
        className={cn("select-none", className)}
        draggable={false}
      />
    );
  }

  // Theme-aware default: render both and let CSS hide the one that
  // doesn't belong with the current theme.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SOURCE.default}
        alt="Talental"
        width={width}
        height={px}
        className={cn("theme-light-only select-none", className)}
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SOURCE["on-ink"]}
        alt="Talental"
        width={width}
        height={px}
        className={cn("theme-dark-only select-none", className)}
        draggable={false}
      />
    </>
  );
}
