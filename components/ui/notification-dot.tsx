import { cn } from "@/lib/utils";

/**
 * macOS-style red notification badge. Pure visual primitive:
 *   - hidden entirely when count === 0 (no zero-state ghost).
 *   - shows the number when 1..99.
 *   - shows "99+" when count > 99 so it can never blow past the
 *     pill's nominal width.
 *
 * Sized for inline use next to a 14–16px text label. Use the `size`
 * prop when sitting next to bigger headings (e.g. the job page
 * title where 'lg' matches the visual weight of an h1).
 */
export function NotificationDot({
  count,
  size = "sm",
  className,
}: {
  count: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  const sizing =
    size === "lg"
      ? "min-w-[18px] h-[18px] text-[11px] px-1"
      : "min-w-[14px] h-[14px] text-[10px] px-1";
  return (
    <span
      aria-label={`${count} sin revisar`}
      title={`${count} sin revisar`}
      className={cn(
        // white-on-danger is universally legible across the
        // light + dark Distillate palettes (the danger token is a
        // saturated wine in both modes).
        "inline-flex items-center justify-center rounded-full bg-danger font-semibold leading-none text-white",
        sizing,
        className,
      )}
    >
      {label}
    </span>
  );
}
