"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { visibleSettingsSections } from "./settings-sections";

// Re-export for callers that historically imported types/data from
// here. New code should import directly from ./settings-sections.
export type { SettingsSectionId } from "./settings-sections";
export {
  SETTINGS_SECTIONS,
  visibleSettingsSections,
} from "./settings-sections";

/**
 * Horizontal tab row for the settings sub-sections — mirrors the
 * pattern from JobTabs so the navigation feels native to the rest
 * of the app instead of the old side-nav. Scrolls horizontally on
 * narrow viewports.
 */
export function SettingsTabs({
  isAdmin,
  isOwner,
}: {
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const pathname = usePathname() ?? "";
  const visible = visibleSettingsSections({ isAdmin, isOwner });
  return (
    <nav
      aria-label="Secciones de configuración"
      className="mb-4 flex min-w-0 gap-1 overflow-x-auto border-b border-border"
    >
      {visible.map((s) => {
        // `startsWith` so `/settings/custom-fields/job` highlights the
        // Campos tab when the user is deep-linking into an entity tab.
        const active =
          pathname === s.href || pathname.startsWith(s.href + "/");
        const Icon = s.Icon;
        return (
          <Link
            key={s.id}
            href={s.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-accent font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
