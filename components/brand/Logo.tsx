import { cn } from "@/lib/utils";

/**
 * The Talental logo — the olive dot, alone. Used in favicons, app
 * icons, collapsed nav, avatar placeholders, anywhere the wordmark
 * doesn't fit.
 *
 * Variants:
 *   - `square`  — dot centered in a rounded square (border-radius 22%)
 *                 whose fill is `foreground`. The contrast is the mark.
 *   - `circle`  — same idea but with a circular container.
 *   - `bare`    — just the dot, no container. For cases where the
 *                 surrounding surface already provides contrast.
 *
 * The inner dot is ~35% of the container width.
 *
 * See /docs/brand-system.md.
 */
export type LogoSize = "sm" | "md" | "lg" | "xl";
export type LogoVariant = "square" | "circle" | "bare";

const SIZE_PX: Record<LogoSize, number> = {
  sm: 24,
  md: 40,
  lg: 64,
  xl: 96,
};

const DOT_RATIO = 0.35;

export function Logo({
  variant = "square",
  size = "md",
  className,
}: {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
}) {
  const outerPx = SIZE_PX[size];
  const dotPx = Math.round(outerPx * DOT_RATIO);

  // Bare variant: just the dot, sized to the requested size — useful
  // when the surrounding chrome already supplies contrast.
  if (variant === "bare") {
    return (
      <span
        role="img"
        aria-label="Talental"
        className={cn("inline-block bg-accent rounded-full", className)}
        style={{ width: outerPx, height: outerPx }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label="Talental"
      className={cn(
        "inline-flex items-center justify-center bg-foreground",
        className,
      )}
      style={{
        width: outerPx,
        height: outerPx,
        borderRadius: variant === "circle" ? "9999px" : `${outerPx * 0.22}px`,
      }}
    >
      <span
        className="block bg-accent rounded-full"
        style={{ width: dotPx, height: dotPx }}
      />
    </span>
  );
}
