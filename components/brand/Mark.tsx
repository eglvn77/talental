import { cn } from "@/lib/utils";

/**
 * Talental Mark — the "T." compact lockup. Use anywhere the wordmark
 * doesn't fit: favicon, avatar, app icon, collapsed sidebar rail.
 *
 * Renders the canonical SVG files from `public/brand/svg/`. Two
 * variants only (one per theme):
 *
 *  - light / `default` → `/brand/svg/talental-t.svg`
 *                         (ink letter + olive period)
 *  - dark  / `on-ink`  → `/brand/svg/talental-t-on-ink.svg`
 *                         (bone letter + olive-light period, ink bg)
 *
 * Default behaviour is theme-aware: both files render side by side
 * and CSS hides whichever doesn't belong with the current theme
 * (`data-theme="dark"` or OS dark preference). Passing an explicit
 * `variant` overrides the auto-switch.
 *
 * Cutover rules (handoff):
 *  - Never lock up the T. with the wordmark — they're the same thing
 *    at two scales.
 *  - Letters on bone: ink + olive dot. Letters on ink: bone + olive-
 *    light dot.
 *  - Never recolor the letter.
 */
export type MarkSize = "sm" | "md" | "lg" | "xl";
export type MarkVariant = "default" | "on-ink";

const SIZE_PX: Record<MarkSize, number> = {
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
};

const SOURCE: Record<MarkVariant, string> = {
  default: "/brand/svg/talental-t.svg",
  "on-ink": "/brand/svg/talental-t-on-ink.svg",
};

export function Mark({
  size = "md",
  variant,
  className,
}: {
  size?: MarkSize;
  /**
   * Omit to follow the active theme automatically. Pass explicitly
   * to force one variant regardless of theme.
   */
  variant?: MarkVariant;
  className?: string;
}) {
  const px = SIZE_PX[size];

  if (variant) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={SOURCE[variant]}
        alt="Talental"
        width={px}
        height={px}
        className={cn("select-none", className)}
        draggable={false}
      />
    );
  }

  // Theme-aware default.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SOURCE.default}
        alt="Talental"
        width={px}
        height={px}
        className={cn("theme-light-only select-none", className)}
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SOURCE["on-ink"]}
        alt="Talental"
        width={px}
        height={px}
        className={cn("theme-dark-only select-none", className)}
        draggable={false}
      />
    </>
  );
}
