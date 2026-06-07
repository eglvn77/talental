import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      // Focus follows the Distillate rule: solid 2px olive ring with
      // 2px offset (`ring-offset-2`). No translucent halo, no border
      // recolor — the ring is the entire focus affordance.
      className={cn(
        "flex h-9 pointer-coarse:h-11 w-full rounded-md border border-border bg-surface-sunken px-3 py-1 text-sm transition-[color,border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
