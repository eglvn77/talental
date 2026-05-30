"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
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
  const t = useT();
  const visible = visibleSettingsSections({ isAdmin, isOwner });
  return (
    <nav
      aria-label={t("settings.tabsAria")}
      className="mb-4 flex min-w-0 gap-1 overflow-x-auto border-b border-border"
    >
      {visible.map((s) => {
        // Match against `matchPrefix` when provided (Campos
        // personalizados uses /settings/custom-fields so all entity
        // sub-routes highlight the same tab); otherwise compare
        // against the section's own href, accepting trailing
        // sub-paths so deep links light up the right tab.
        const prefix = s.matchPrefix ?? s.href;
        const active =
          pathname === prefix || pathname.startsWith(prefix + "/");
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
            {t(s.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
