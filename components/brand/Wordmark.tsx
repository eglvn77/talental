import { cn } from "@/lib/utils";

/**
 * Talental wordmark — the "Talental." lockup.
 *
 * Renders the canonical brand SVG file directly from
 * `public/brand/svg/`, so updates to the master file (kept in sync
 * with the Drive-of-truth brand assets) flow into the app
 * automatically. No inline path duplication to drift.
 *
 *  - `variant="default"`  → `/brand/svg/talental-wordmark.svg`
 *                            (ink letters + olive period — for bone
 *                            surfaces)
 *  - `variant="on-ink"`   → `/brand/svg/talental-wordmark-on-ink.svg`
 *                            (bone letters + olive-light period —
 *                            for ink surfaces)
 *
 * Per the handoff cutover rules:
 *  - **Diminuendo wordmark** at ≥32 px (file is `talental-wordmark.svg`)
 *  - **Flat wordmark** at <32 px (file is `talental-wordmark-flat.svg`)
 * The component picks automatically based on size.
 *
 * Never recolor the letters. Never place over photography.
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
// so the `<Image>` doesn't get distorted.
const SOURCE = {
  diminuendo: {
    default: { src: "/brand/svg/talental-wordmark.svg", w: 796.8, h: 236 },
    onInk: { src: "/brand/svg/talental-wordmark-on-ink.svg", w: 796.8, h: 236 },
  },
  flat: {
    default: { src: "/brand/svg/talental-wordmark-flat.svg", w: 824.2, h: 236 },
    onInk: {
      src: "/brand/svg/talental-wordmark-flat-on-ink.svg",
      w: 824.2,
      h: 236,
    },
  },
} as const;

export function Wordmark({
  size = "md",
  variant = "default",
  className,
}: {
  size?: WordmarkSize;
  variant?: WordmarkVariant;
  className?: string;
}) {
  const px = SIZE_PX[size];
  const useFlat = px < 32;
  const sources = useFlat ? SOURCE.flat : SOURCE.diminuendo;
  const file = variant === "on-ink" ? sources.onInk : sources.default;
  const aspect = file.w / file.h;
  const width = Math.round(px * aspect);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={file.src}
      alt="Talental"
      width={width}
      height={px}
      className={cn("select-none", className)}
      draggable={false}
    />
  );
}
