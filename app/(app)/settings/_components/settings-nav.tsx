"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import {
  MODULES,
  PARAM_DEFAULTS,
  TOP_LEVEL,
  tabVisible,
  visibleTabs,
  type SettingsModule,
  type SettingsTab,
} from "./settings-sections";

// Re-export for callers that historically imported from here.
export { MODULES, TOP_LEVEL } from "./settings-sections";

/**
 * Two-level settings navigation. Primary row: the standalone entries
 * (Profile, Team, Careers) then the module groups (Jobs, Candidates,
 * Companies, Contacts). When the current page belongs to a module, a
 * secondary row shows that module's internal tabs.
 */
export function SettingsTabs({
  isAdmin,
  isOwner,
}: {
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const sp = useSearchParams();
  const flags = { isAdmin, isOwner };

  function matchTab(tab: SettingsTab): boolean {
    const base = tab.href.split("?")[0];
    const onBase = pathname === base || pathname.startsWith(base + "/");
    if (!onBase) return false;
    if (tab.param) {
      const v = sp?.get(tab.param.key) ?? PARAM_DEFAULTS[tab.param.key];
      return v === tab.param.value;
    }
    return true;
  }

  const topLevel = TOP_LEVEL.filter((t) => tabVisible(t, flags));
  const modules = MODULES.filter(
    (m) => (!m.adminOnly || isAdmin) && visibleTabs(m, flags).length > 0,
  );

  const activeTop = topLevel.find((t) => matchTab(t));
  const activeModule: SettingsModule | undefined = modules.find((m) =>
    visibleTabs(m, flags).some((tab) => matchTab(tab)),
  );

  return (
    <div className="mb-5 space-y-2">
      {/* Primary row */}
      <nav
        aria-label={t("settings.tabsAria")}
        className="flex min-w-0 flex-wrap items-center gap-1 border-b border-border"
      >
        {topLevel.map((tab) => (
          <NavLink
            key={tab.id}
            href={tab.href}
            label={t(tab.labelKey)}
            active={activeTop?.id === tab.id}
          />
        ))}
        {topLevel.length > 0 && modules.length > 0 ? (
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        ) : null}
        {modules.map((m) => (
          <NavLink
            key={m.id}
            href={m.href}
            label={t(m.labelKey)}
            active={activeModule?.id === m.id}
          />
        ))}
      </nav>

      {/* Secondary row — the active module's tabs. */}
      {activeModule ? (
        <nav
          aria-label={t(activeModule.labelKey)}
          className="flex min-w-0 flex-wrap items-center gap-1"
        >
          {visibleTabs(activeModule, flags).map((tab) => (
            <SubLink
              key={tab.id}
              href={tab.href}
              label={t(tab.labelKey)}
              active={matchTab(tab)}
            />
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center border-b-2 px-3 py-2 text-sm transition-colors",
        active
          ? "border-accent font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

function SubLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-accent/10 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
