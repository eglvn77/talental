import Link from "next/link";
import type { CareersWorkspaceHeader } from "../_lib/data";

/**
 * Branded header for the careers site. Renders the workspace's logo
 * (or initials fallback), name, and optional tagline. The whole bar
 * links back to the workspace's landing — handy from a deep-linked
 * job page.
 *
 * Accent color is applied via inline style (workspace-specific) so
 * each tenant's careers site can carry its brand color on the
 * subtle accent strip below the row. Falls back to the Distillate
 * olive when the workspace hasn't set one.
 */
export function CareersHeader({
  header,
  landingHref,
  jobLink,
}: {
  header: CareersWorkspaceHeader;
  /** Workspace landing URL — the brand row links here so deep-linked
   *  posting pages have a one-click way back to the rest of the
   *  vacantes. */
  landingHref: string;
  /** Optional secondary link shown to the right (e.g. "Ver todas las
   *  vacantes" from an individual posting page). */
  jobLink?: { href: string; label: string };
}) {
  const accent = header.accent_color || undefined;
  return (
    <header className="border-b border-border bg-bg-1">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link
          href={landingHref}
          className="flex min-w-0 items-center gap-3"
        >
          {header.logo_url ? (
            // Free aspect ratio: a recruiter's brand mark can be a
            // round avatar, a horizontal wordmark, or anything in
            // between. We constrain height + max-width and let the
            // image keep its own shape via `object-contain`.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={header.logo_url}
              alt={header.name}
              className="h-10 w-auto max-w-[200px] object-contain"
            />
          ) : (
            // No logo → initials placeholder + the workspace name.
            // When a logo is set, the name would just repeat what the
            // mark already says, so we hide it.
            <>
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent ring-1 ring-border-1"
                aria-hidden
              >
                {header.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {header.name}
                </div>
                {header.careers_tagline ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {header.careers_tagline}
                  </div>
                ) : null}
              </div>
            </>
          )}
          {header.logo_url && header.careers_tagline ? (
            // With a logo we drop the agency name, but the tagline
            // (e.g. "Buscamos talento que cambia industrias") still
            // sits to the right because it's not redundant.
            <div className="min-w-0 truncate text-xs text-muted-foreground">
              {header.careers_tagline}
            </div>
          ) : null}
        </Link>
        {jobLink ? (
          <Link
            href={jobLink.href}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            ← {jobLink.label}
          </Link>
        ) : null}
      </div>
      {/* Accent stripe — workspace's brand color (or olive default).
          Two pixels tall so the page reads as branded without
          overwhelming the content. */}
      <div
        className="h-[2px] w-full"
        style={{ background: accent ?? "var(--accent)" }}
        aria-hidden
      />
    </header>
  );
}
