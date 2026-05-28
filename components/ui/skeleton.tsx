import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Two design calls baked in:
 *
 *   1. **Quiet color.** Uses `bg-fg-1/[0.06]` (ink at 6% opacity over
 *      bone) instead of a solid muted tone. The block reads as
 *      "something is loading here" without competing with the surface
 *      it sits on — important when 8 of them stack in a list view.
 *
 *   2. **Delayed fade-in.** opacity starts at 0 and animates to 1
 *      after a 150 ms hold. Sub-second navs never flash the skeleton
 *      at all; only when the server work is actually slow does the
 *      placeholder appear. Without this, fast clicks felt CHOPPIER
 *      than no skeleton because the user briefly saw the placeholder
 *      pop in and out.
 *
 * The pulse animation stays — once the skeleton IS visible, the
 * gentle breathing is what reads as "still loading".
 */
export function Skeleton({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-fg-1/[0.06] motion-safe:animate-pulse",
        "opacity-0 motion-safe:animate-[skeletonFadeIn_200ms_ease-out_150ms_forwards]",
        className,
      )}
      style={style}
      {...props}
    />
  );
}
