import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — Distillate primitive. Paper surface (`--bg-2`), 10px radius,
 * soft hairline border. No default shadow — borders carry the weight.
 * If you need an explicit lift, compose with the `.shadow-card` or
 * `.shadow-lift` utility from globals.css.
 */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[10px] border border-border-soft bg-bg-2",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";
