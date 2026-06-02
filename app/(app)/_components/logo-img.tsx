"use client";

/**
 * A logo/avatar <img> that hides itself if the source 404s. Lives in
 * its own client component because the `onError` handler is an event
 * handler — a Server Component can't render it (the RSC payload can't
 * serialize event handlers), so any server-rendered usage would crash
 * with "Event handlers cannot be passed to Client Component props".
 */
export function LogoImg({
  src,
  alt,
  className,
  size = 28,
}: {
  src: string;
  alt: string;
  className?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className={className}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
