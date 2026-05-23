import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Pill — Distillate status primitive.
 *
 * Mono uppercase, tracked +0.06em, 999px radius. Use only for
 * **metadata** (job status, deal stage, candidate origin) — never as
 * a button or call-to-action. The earth-tint variants map to the
 * handoff's olive/moss/ochre/wine semantics.
 *
 * Replaces the inline status chips sprinkled across the app
 * (StatusPill in companies-table, the stage chips in pipelines, etc).
 */
const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-mono text-[10px] font-medium uppercase tracking-[0.06em] leading-none",
  {
    variants: {
      tone: {
        // Neutral / "sourced" — stone text on tint, the default for
        // unranked metadata.
        neutral:
          "bg-bg-3 text-fg-muted",
        // Accent — the brand moment in pill form. Use for the
        // primary in-progress or shortlist state, sparingly.
        accent:
          "bg-accent-tint text-accent",
        // Positive (moss) — in-progress, on-track.
        success:
          "bg-positive-soft text-positive",
        // Warning (ochre) — screening, attention needed.
        warning:
          "bg-warning-soft text-warning",
        // Danger (wine) — rejected, blocked.
        danger:
          "bg-danger-soft text-danger",
        // Info (stone) — informational, lower-stakes than warning.
        info: "bg-info-soft text-info",
      },
      size: {
        sm: "px-2 py-0.5",
        md: "px-2.5 py-1",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  /** Show a leading status dot in the current text color. */
  dot?: boolean;
}

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ className, tone, size, dot, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(pillVariants({ tone, size }), className)}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  ),
);
Pill.displayName = "Pill";
