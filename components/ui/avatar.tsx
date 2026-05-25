import { cn } from "@/lib/utils";

/**
 * Circular user/team-member avatar. Renders the image when an URL is
 * supplied; falls back to the user's initials over an olive-tinted
 * disc so empty avatars still feel branded instead of generic.
 *
 * Used by the sidebar's user menu, the profile page, and (eventually)
 * member rows in /settings/team. Keep it presentational — no auth /
 * RLS knowledge here.
 */
export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  /** Used for both the alt text and the fallback initials. */
  name: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes: Record<typeof size, string> = {
    xs: "h-5 w-5 text-[9px]",
    sm: "h-7 w-7 text-[10px]",
    md: "h-8 w-8 text-xs",
    lg: "h-10 w-10 text-sm",
    xl: "h-20 w-20 text-xl",
  };
  const initials = computeInitials(name);
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-accent-soft font-medium uppercase text-accent ring-1 ring-border-1/60",
        sizes[size],
        className,
      )}
      aria-label={name ?? undefined}
    >
      {src ? (
        // Plain <img> — we accept arbitrary user-uploaded URLs (Supabase
        // Storage public links). Next/Image would require an explicit
        // remotePatterns entry per project URL, and the avatar is
        // already tiny so we don't need the optimization pipeline here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name ?? "Avatar"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}

function computeInitials(name: string | null): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
