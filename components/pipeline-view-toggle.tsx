import Link from "next/link";
import { LayoutGrid, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";

export type PipelineView = "table" | "kanban";

// URL-driven toggle — pairs with `?view=` searchParam on the portal page.
// Matches the visual of the prior client-state version but renders as
// two <Link>s so it stays server-side and shareable.
export function PipelineViewToggle({
  portalSlug,
  active,
}: {
  portalSlug: string;
  active: PipelineView;
}) {
  const items: Array<{ key: PipelineView; href: string; label: string; Icon: typeof LayoutList }> = [
    { key: "table", href: `/p/${portalSlug}`, label: "Table view", Icon: LayoutList },
    { key: "kanban", href: `/p/${portalSlug}?view=kanban`, label: "Kanban view", Icon: LayoutGrid },
  ];

  return (
    <div
      role="tablist"
      aria-label="View"
      className="inline-flex items-center rounded-md border border-border bg-background p-1"
    >
      {items.map(({ key, href, label, Icon }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={href}
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            title={label}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </Link>
        );
      })}
    </div>
  );
}
