"use client";

import { useState } from "react";

/**
 * <img> for the company logo on the share page header pill.
 * Clearbit (our fallback source when companies.logo_url is null)
 * returns a 404 PNG for unknown domains. Without an onError
 * handler that 404 renders as a broken-image icon — uglier than
 * the initial-letter circle we use when there's nothing. This
 * client component hides the image on load failure so the parent
 * can render the placeholder instead.
 */
export function CompanyLogoImg({
  src,
  alt,
  fallback,
}: {
  src: string;
  alt: string;
  /** Rendered when the image fails to load (broken URL, 404,
   *  CORS, etc.). Typically an initial-letter placeholder. */
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-6 w-6 shrink-0 rounded-full border border-border bg-card object-contain"
      onError={() => setFailed(true)}
    />
  );
}
