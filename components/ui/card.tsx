import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — Distillate primitive. Pure-white raised surface, 10px
 * radius, single hairline border. No default shadow — borders carry
 * the weight. If you need an explicit lift, compose with the
 * `.shadow-card` or `.shadow-lift` utility from globals.css.
 *
 * Padding follows the 8pt scale: CardContent = p-6 (24px). For
 * compact cards (e.g. inline list items) pass `p-4` (16px) via the
 * `className` prop. Never `p-5` or arbitrary values.
 */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[10px] border border-border bg-card",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";
