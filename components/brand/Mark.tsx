import { cn } from "@/lib/utils";

/**
 * Talental Mark — the "T." compact lockup. Use anywhere the wordmark
 * doesn't fit: favicon (served at /brand/svg/talental-t.svg via the
 * root metadata), avatar, app icon, collapsed sidebar rail.
 *
 * Renders the canonical SVG file directly from `public/brand/svg/`,
 * so updates to the master flow into the app automatically.
 *
 *  - `variant="default"` → `/brand/svg/talental-t.svg`
 *                           (ink letter + olive period)
 *  - `variant="on-ink"`  → `/brand/svg/talental-t-on-ink.svg`
 *                           (bone letter + olive-light period)
 *  - `variant="bare"`    → falls back to the default file. Reserved
 *                           for slots where the parent container
 *                           already paints the letter colour; today
 *                           the file's hard-coded ink reads fine on
 *                           the bone tile placements.
 *
 * Cutover rules (handoff):
 *  - Never lock up the T. with the wordmark — they're the same thing
 *    at two scales.
 *  - Letters on bone: ink + olive dot. Letters on ink: bone + olive-
 *    light.
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

// Native pixel dimensions from the master SVGs.
const SOURCE_DEFAULT = {
  src: "/brand/svg/talental-t.svg",
  w: 410.8,
  h: 432,
} as const;
const SOURCE_ON_INK = {
  src: "/brand/svg/talental-t-on-ink.svg",
  w: 410.8,
  h: 432,
} as const;

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
  const file = variant === "on-ink" ? SOURCE_ON_INK : SOURCE_DEFAULT;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={file.src}
      alt="Talental"
      width={px}
      height={px}
      className={cn("select-none", className)}
      draggable={false}
    />
  );
}
