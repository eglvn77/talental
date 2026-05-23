import { cn } from "@/lib/utils";

/**
 * Talental Mark — the "T." compact lockup. Use anywhere the wordmark
 * doesn't fit: favicon, avatar, app icon, collapsed sidebar rail.
 *
 * Built from the path-based `talental-t.svg` in the official logo
 * system. The letter is `currentColor`, the period is `var(--accent)`
 * so light/dark mode adapt automatically (the accent token already
 * resolves to olive-light in dark mode).
 *
 * Cutover rules (handoff):
 *  - Never lock up the T. with the wordmark — they're the same thing
 *    at two scales.
 *  - Letters on bone: ink + olive dot. Letters on ink: bone + olive-light.
 *  - Never recolor the letter.
 */
export type MarkSize = "sm" | "md" | "lg" | "xl";
export type MarkVariant = "default" | "on-ink" | "bare";

const SIZE_PX: Record<MarkSize, number> = {
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
};

// Verbatim from `public/brand/svg/talental-t.svg`.
const VIEWBOX = "0 0 410.80 432.00";
const LETTER_PATH =
  "M146.40 400L92.80 400L92.80 163.60L10.80 163.60L10.80 120L228 120L228 163.60L146.40 163.60L146.40 400Z";
const LETTER_TRANSFORM = "translate(60.00,-28.00)";
const PERIOD = { cx: 320.8, cy: 342, r: 30 } as const;

export function Mark({
  size = "md",
  variant = "default",
  className,
}: {
  size?: MarkSize;
  variant?: MarkVariant;
  className?: string;
}) {
  const px = SIZE_PX[size];
  // `bare` = no wrapper color override, inherits from caller. Useful
  // when the surrounding chrome (e.g. an avatar tile) already locks
  // the letter color.
  const wrapperColor =
    variant === "on-ink"
      ? "text-bg-1"
      : variant === "default"
        ? "text-fg-1"
        : undefined;
  // Square viewBox makes width = height; aspect is ~0.95 but renders
  // square for layout purposes.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOX}
      width={px}
      height={px}
      role="img"
      aria-label="Talental"
      className={cn(wrapperColor, className)}
    >
      <path
        d={LETTER_PATH}
        fill="currentColor"
        transform={LETTER_TRANSFORM}
      />
      <circle
        cx={PERIOD.cx}
        cy={PERIOD.cy}
        r={PERIOD.r}
        fill="var(--accent)"
      />
    </svg>
  );
}
