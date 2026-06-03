"use client";

import { useEffect, useState } from "react";

/**
 * Render an ISO timestamp formatted for the user's BROWSER timezone.
 * Server components that just call `new Date(iso).toLocaleString()`
 * format with the SERVER's timezone (usually UTC on Vercel), which
 * surfaces as "6 hours off" for Mexico City recruiters. This client
 * component sidesteps that by formatting after hydration.
 *
 * On first render it falls back to the ISO string so SSR markup is
 * stable; after hydration it replaces the text with the local-format
 * version. Avoids a hydration mismatch warning.
 */
export function LocalDateTime({
  iso,
  locale = "es-MX",
  options,
}: {
  iso: string;
  locale?: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const [text, setText] = useState<string>(iso);
  useEffect(() => {
    try {
      setText(
        new Date(iso).toLocaleString(
          locale,
          options ?? {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          },
        ),
      );
    } catch {
      setText(iso);
    }
  }, [iso, locale, options]);
  return <span suppressHydrationWarning>{text}</span>;
}
