"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders a company logo with a 3-step fallback chain:
 *   1. `src` (e.g. logo.clearbit.com URL stored in DB — often dead since
 *      HubSpot retired Clearbit's public logo API mid-2024)
 *   2. Google Favicons (`www.google.com/s2/favicons?domain=...`) — free,
 *      no auth, returns at least a 16-32px favicon for almost any domain
 *   3. The first letter of `name` (for md/lg) or a generic Building2
 *      icon (for sm or when no name is provided)
 *
 * Client component because the fallback state lives in useState driven
 * by <img onError>. Use this anywhere a stored logo_url might be stale.
 */

type Size = "sm" | "md" | "lg";

const SIZE: Record<
  Size,
  { box: string; icon: string; text: string }
> = {
  sm: {
    box: "h-4 w-4 rounded",
    icon: "h-2.5 w-2.5",
    text: "text-[8px]",
  },
  md: {
    box: "h-6 w-6 rounded border border-border bg-white",
    icon: "h-3.5 w-3.5",
    text: "text-[10px]",
  },
  lg: {
    box: "h-7 w-7 rounded border border-border bg-white",
    icon: "h-3.5 w-3.5",
    text: "text-xs",
  },
};

export function CompanyLogo({
  src,
  domain,
  name,
  size = "md",
  className,
}: {
  src: string | null;
  domain: string | null;
  name?: string;
  size?: Size;
  className?: string;
}) {
  const googleFavicon = domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
    : null;
  const initialStep: 0 | 1 | 2 = src ? 0 : googleFavicon ? 1 : 2;
  const [step, setStep] = useState<0 | 1 | 2>(initialStep);
  const sz = SIZE[size];

  if (step === 0 && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn("shrink-0 object-contain", sz.box, className)}
        referrerPolicy="no-referrer"
        onError={() => setStep(googleFavicon ? 1 : 2)}
      />
    );
  }

  if (step === 1 && googleFavicon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={googleFavicon}
        alt=""
        className={cn("shrink-0 object-contain", sz.box, className)}
        referrerPolicy="no-referrer"
        onError={() => setStep(2)}
      />
    );
  }

  // Step 2 — final fallback.
  const useInitial = size !== "sm" && name && name[0];
  const fallbackBox = cn(
    "inline-flex shrink-0 items-center justify-center bg-muted text-muted-foreground",
    sz.box,
    className,
  );

  if (useInitial) {
    return (
      <span className={cn(fallbackBox, "uppercase", sz.text)}>{name![0]}</span>
    );
  }
  return (
    <span className={fallbackBox}>
      <Building2 className={sz.icon} />
    </span>
  );
}
