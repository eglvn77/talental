import Link from "next/link";
import type { CareersWorkspaceHeader } from "../_lib/data";
import { CareersLanguageToggle } from "./language-toggle";

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
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        {/* Logos intentionally NOT shown on the careers site (recruiter
            request) — the workspace name renders as plain text, with the
            tagline beneath it when set. */}
        <Link href={landingHref} className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground">
              {header.name}
            </div>
            {header.careers_tagline ? (
              <div className="truncate text-xs text-muted-foreground">
                {header.careers_tagline}
              </div>
            ) : null}
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          {jobLink ? (
            <Link
              href={jobLink.href}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← {jobLink.label}
            </Link>
          ) : null}
          {/* Globe control — lets the visitor pick the site language;
              the active one is highlighted. */}
          <CareersLanguageToggle />
        </div>
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
