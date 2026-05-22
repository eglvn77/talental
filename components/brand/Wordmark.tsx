import { cn } from "@/lib/utils";

/**
 * The Talental wordmark — "Talental" in DM Sans 500 with a period in
 * the accent color. The period is part of the brand (firma visual)
 * and is never omitted.
 *
 * Text inherits `foreground` from the parent. The period uses the
 * `accent` token, so the wordmark auto-adapts to light/dark mode.
 *
 * See /docs/brand-system.md.
 */
export type WordmarkSize = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<WordmarkSize, number> = {
  sm: 14,
  md: 20,
  lg: 32,
  xl: 56,
};

export function Wordmark({
  size = "md",
  className,
}: {
  size?: WordmarkSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-sans font-medium leading-none text-foreground",
        className,
      )}
      style={{
        fontSize: `${SIZE_PX[size]}px`,
        letterSpacing: "-0.04em",
      }}
      aria-label="Talental"
    >
      Talental<span className="text-accent">.</span>
    </span>
  );
}
