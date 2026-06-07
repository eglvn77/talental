import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * App-wide page chrome. Two primitives every list/detail screen
 * composes:
 *
 *   <PageContainer>
 *     <PageHeader title="…" actions={…} meta={…} />
 *     {content}
 *   </PageContainer>
 *
 * Spacing system uses the 8pt scale exclusively (Tailwind's default
 * tokens 1/2/3/4/6/8/12/16 = 4/8/12/16/24/32/48/64 px). Don't add
 * arbitrary paddings.
 *
 * Typography: title = text-2xl font-semibold tracking-tight; meta =
 * text-[11px] font-medium uppercase tracking-wider. Hierarchy lives
 * in size + weight, not color — secondary text inherits the muted
 * token only when truly muted.
 */

/**
 * Page wrapper. Centers content at 1200px, 24px gutter, 32px top
 * padding so the title clears the top bar without a void.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  /** Caller may extend; do not override the spacing tokens. */
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-[1200px] px-6 pt-8 pb-12",
        className,
      )}
    >
      {children}
    </main>
  );
}

/**
 * Standardized page header — title row + optional meta line + 24px
 * spacing before content.
 *
 *  - title: the page title (rendered as h1, semibold, tracking-tight)
 *  - actions: right-aligned, vertically centered with the title
 *  - meta: small meta line (count, hint) rendered 8px below the title
 *    group. Same row pattern as the toolbar slot, but visually
 *    distinct (uppercase, tracking-wider, muted weight).
 *  - toolbar: right-aligned with meta (e.g. search + filter + view
 *    icons on list pages)
 */
export function PageHeader({
  title,
  actions,
  meta,
  toolbar,
}: {
  title: ReactNode;
  /** Primary action(s) right-aligned next to title. One filled
   *  primary per view; secondary buttons should be outline/ghost. */
  actions?: ReactNode;
  /** Count / hint line, e.g. "25 of 25". Optional. */
  meta?: ReactNode;
  /** Right-aligned cluster on the meta row (filters, view toggle). */
  toolbar?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {meta || toolbar ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          {meta ? (
            <div className="text-xs text-muted-foreground">{meta}</div>
          ) : (
            <span aria-hidden />
          )}
          {toolbar ? (
            <div className="flex items-center gap-2">{toolbar}</div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Small uppercase meta label used inside cards / detail panels for
 * section dividers. Pairs with 12px gap to its content (mb-3).
 */
export function SectionLabel({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  /** Optional inline icon (rendered before the text). */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "mb-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {icon}
      {children}
    </h2>
  );
}
