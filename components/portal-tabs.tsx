import Link from "next/link";
import { cn } from "@/lib/utils";

export type PortalTabKey = "pipeline" | "jd";

export function PortalTabs({
  portalSlug,
  active,
}: {
  portalSlug: string;
  active: PortalTabKey;
}) {
  const tabs: Array<{ key: PortalTabKey; label: string; href: string }> = [
    { key: "pipeline", label: "Pipeline", href: `/p/${portalSlug}` },
    { key: "jd", label: "Job Description", href: `/p/${portalSlug}?tab=jd` },
  ];
  return (
    <nav
      className="flex gap-6 border-b border-border"
      aria-label="Portal sections"
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "-mb-px rounded-sm border-b-2 pb-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
