import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Eyebrow — Distillate metadata header.
 *
 * Mono uppercase tracked +0.06em, sits above a section title or in
 * the metadata column of an editorial layout. Pairs with table
 * headers, section intros, sidebar group labels, and the right-column
 * meta strip in marketing.
 *
 *   ┌──────────────────────┐
 *   │ STAGE 02 / 04         │
 *   │ Submit to client      │
 *   └──────────────────────┘
 */
export type EyebrowProps = React.HTMLAttributes<HTMLSpanElement>;

export const Eyebrow = React.forwardRef<HTMLSpanElement, EyebrowProps>(
  ({ className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  ),
);
Eyebrow.displayName = "Eyebrow";
