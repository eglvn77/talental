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
  jobLink,
}: {
  header: CareersWorkspaceHeader;
  /** Optional secondary link shown to the right (e.g. "Ver todas las
   *  vacantes" from an individual posting page). */
  jobLink?: { href: string; label: string };
}) {
  const accent = header.accent_color || undefined;
  return (
    <header className="border-b border-border bg-bg-1">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link
          href={`/${header.id ? "" : ""}`}
          // Always points to the workspace landing — the wrapper page
          // uses `notFound()` when the slug is bad so we know `name`
          // here is canonical.
          className="flex items-center gap-3"
        >
          {header.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={header.logo_url}
              alt={header.name}
              className="h-9 w-9 rounded-full object-cover ring-1 ring-border-1"
            />
          ) : (
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent ring-1 ring-border-1"
              aria-hidden
            >
              {header.name.slice(0, 1).toUpperCase()}
            </span>
          )}
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
