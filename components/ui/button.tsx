import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — Distillate primitive.
 *
 * Hover = color shift, never opacity, never size. Press = color
 * deepens via the `active:` modifier plus a 0.5px y-translate. Focus
 * = solid 2px olive ring with 2px offset on bone.
 *
 * Variants per the handoff:
 *  - default — olive surface. The brand moment, use sparingly (rule
 *    of one).
 *  - outline — hairline border on bone; hover swaps to paper.
 *  - ghost   — transparent; hover swaps to paper.
 *  - link    — accent text + hover underline.
 *  - ink     — ink surface with bone text (per ATS kit), inverse of
 *    the default and the second-most-emphatic button.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-fg-on-accent hover:bg-accent-press active:bg-accent-press",
        outline:
          "border border-border bg-bg-1 text-foreground hover:bg-bg-2",
        ghost: "text-foreground hover:bg-bg-2",
        link: "text-accent underline-offset-4 hover:underline",
        ink: "bg-fg-1 text-bg-1 hover:bg-fg-2 active:bg-fg-2",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
