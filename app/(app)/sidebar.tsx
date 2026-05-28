"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  BookUser,
  Briefcase,
  Building2,
  ChevronDown,
  Loader2,
  LogOut,
  Settings,
  UserSearch,
} from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/login/actions";
import { useSidebarCollapsed } from "./_components/sidebar-state";

export type SidebarUser = {
  name: string | null;
  email: string | null;
  workspaceName: string;
  avatarUrl: string | null;
};

type NavItem = {
  href: string;
  label: string;
  Icon: typeof Briefcase;
  matchPrefix?: string;
  enabled?: boolean;
};

// CRM (/deals) and Finanzas (/finances) are hidden from the sidebar
// for now — the routes still exist and work if visited directly, but
// the navigation focuses on the core hiring flow (Vacantes / Candi-
// datos / Empresas / Contactos) until the secondary modules are
// ready to ship. Re-add their entries to ITEMS to surface them again.
const ITEMS: NavItem[] = [
  {
    href: "/jobs",
    label: "Vacantes",
    Icon: Briefcase,
    matchPrefix: "/jobs",
    enabled: true,
  },
  {
    href: "/candidates",
    label: "Candidatos",
    Icon: UserSearch,
    matchPrefix: "/candidates",
    enabled: true,
  },
  {
    href: "/companies",
    label: "Empresas",
    Icon: Building2,
    matchPrefix: "/companies",
    enabled: true,
  },
  {
    href: "/contacts",
    label: "Contactos",
    Icon: BookUser,
    matchPrefix: "/contacts",
    enabled: true,
  },
];

/**
 * Pure-navigation rail. Brand, global search, and "+ Nuevo" all live
 * in the <TopBar> now — this component is just the section list and
 * the settings/sign-out footer. Collapsed state is owned by the
 * shared `useSidebarCollapsed` hook (localStorage + sync event).
 */
export function AdminSidebar({ user }: { user: SidebarUser | null }) {
  const pathname = usePathname() ?? "";
  // Collapsed state is shared with <TopBar> via useSidebarCollapsed
  // (localStorage + custom event). Toggling from the top bar is
  // reflected here and vice-versa.
  const { collapsed } = useSidebarCollapsed();

  return (
    <aside
      aria-label="Navegación principal"
      // Sticky `top-14` parks the rail just below the 56-px top bar
      // and keeps it visible while the page scrolls. Right divider
      // is painted as an inset box-shadow instead of `border-r` so
      // the active nav item can extend its background past the right
      // edge without leaving the 1-px border line visible at that
      // row. Children paint on top of inset shadows.
      className={cn(
        "sticky top-14 flex h-[calc(100vh-3.5rem)] shrink-0 flex-col bg-bg-2 shadow-[inset_-1px_0_0_var(--border-1)] transition-[width] duration-150",
        // 176-px expanded width comfortably fits the widest copy
        // ("Configuración") without leaving lonely whitespace; the
        // 56-px collapsed state matches the top bar's height.
        collapsed ? "w-14" : "w-44",
      )}
    >
      {/* Items handle their own left padding so the active item can
          extend cleanly to the sidebar's right edge (and 1 px past it
          to overdraw the inset divider). The nav itself only manages
          vertical scroll + spacing. "+ Nuevo" now lives in the top
          bar (right side) — this rail is pure navigation. */}
      <nav
        aria-label="Secciones"
        className="flex-1 overflow-y-auto overflow-x-clip py-3"
      >
        <div className="flex flex-col gap-0.5">
          {ITEMS.map((item) => (
            <SidebarItem
              key={item.label}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </div>
      </nav>

      {/* Footer — user identity + menu. Replaces the old gear-only
          settings button. Avatar + name + workspace are always
          visible (or just the avatar when collapsed); the dropdown
          carries Ajustes + Cerrar sesión. Divider matches the
          sidebar's right edge. */}
      <div className="border-t border-border-1 p-2">
        <UserMenu user={user} collapsed={collapsed} />
      </div>
    </aside>
  );
}

function UserMenu({
  user,
  collapsed,
}: {
  user: SidebarUser | null;
  collapsed: boolean;
}) {
  // We still render the trigger when `user` is null so the layout
  // doesn't jump if the auth fetch fails mid-render — the dropdown is
  // disabled and we show a generic fallback.
  const displayName = user?.name?.trim() || user?.email || "Cuenta";
  const subtitle = user?.workspaceName ?? "—";

  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          aria-label="Menú de cuenta"
          title={collapsed ? `${displayName} · ${subtitle}` : "Menú de cuenta"}
          className={cn(
            "flex w-full items-center rounded-md text-left transition-colors hover:bg-bg-3",
            collapsed
              ? "h-10 justify-center p-1"
              : "gap-2 px-1.5 py-1.5",
          )}
        >
          <Avatar
            src={user?.avatarUrl}
            name={user?.name ?? null}
            size={collapsed ? "md" : "sm"}
          />
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg-1">
                  {displayName}
                </span>
                <span className="block truncate text-xs text-fg-muted">
                  {subtitle}
                </span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
            </>
          ) : null}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          // align=start anchors the menu's left edge to the trigger's
          // left edge — when collapsed the trigger is centred in a 40px
          // strip and a wider menu would clip off the rail. Using
          // collisionPadding=8 lets Radix nudge it inward if needed.
          align="start"
          side="top"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 min-w-[220px] overflow-hidden rounded-md border border-border-1 bg-bg-1 p-1 text-sm shadow-dropdown"
        >
          {/* Identity row inside the dropdown — duplicates what the
              trigger shows when expanded, but when the trigger is in
              its collapsed avatar-only state this is where the user
              sees their full name + workspace. Also useful as a
              non-clickable header to anchor the menu. */}
          <div className="flex items-center gap-2 px-2 py-2">
            <Avatar
              src={user?.avatarUrl}
              name={user?.name ?? null}
              size="sm"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-fg-1">
                {displayName}
              </div>
              <div className="truncate text-xs text-fg-muted">{subtitle}</div>
            </div>
          </div>
          <Dropdown.Separator className="my-1 h-px bg-border-1" />

          <Dropdown.Item asChild>
            <Link
              href="/settings/profile"
              className="flex items-center gap-2 rounded px-2 py-1.5 text-fg-1 outline-none hover:bg-bg-3 focus:bg-bg-3"
            >
              <Settings className="h-3.5 w-3.5" />
              Ajustes
            </Link>
          </Dropdown.Item>

          <Dropdown.Separator className="my-1 h-px bg-border-1" />

          {/* Sign-out: preventDefault on the Radix onSelect so the menu
              doesn't close before the server action runs (the previous
              form-action pattern was racing with Radix's onSelect →
              menu close → form submit cancelled). Calling the server
              action imperatively works because Next.js's redirect()
              throws back through the client runtime. */}
          <Dropdown.Item
            onSelect={(e) => {
              e.preventDefault();
              void signOutAction();
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-danger outline-none hover:bg-danger-soft/40 focus:bg-danger-soft/40"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function SidebarItem({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const active =
    item.matchPrefix &&
    (pathname === item.matchPrefix ||
      (item.matchPrefix !== "/jobs" &&
        pathname.startsWith(item.matchPrefix + "/")) ||
      (item.matchPrefix === "/jobs" &&
        pathname.startsWith("/jobs") &&
        !pathname.startsWith("/companies")));
  const Icon = item.Icon;

  // Layout note: non-active items use horizontal margin (`mx-2`) so
  // they sit inside the sidebar with breathing room. The active item
  // drops its right margin AND extends 1 px past the sidebar edge so
  // its olive-tint background overdraws the inset divider — that's
  // what produces the "open tab" effect, where the right side of the
  // active button visually flows into the page instead of being
  // separated by the sidebar's right border.
  const base = cn(
    "relative flex items-center text-sm transition-colors",
    collapsed ? "h-8 justify-center" : "h-8 gap-2.5 px-2.5",
  );

  if (!item.enabled) {
    return (
      <span
        className={cn(
          base,
          "mx-2 rounded-md cursor-not-allowed text-fg-disabled",
        )}
        title={collapsed ? `${item.label} (próximamente)` : "Próximamente"}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed ? item.label : null}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active
          ? cn(
              // Open-tab look: medium olive background (accent at ~30%
              // opacity over bone — darker than accent-tint, still
              // calm), framed by the same divider colour as the
              // sidebar's outline on top / left / bottom, with the
              // right edge open and bleeding 1 px past the sidebar to
              // overdraw the inset right divider. That cut in the
              // rail is what makes it read as a tab the user opened
              // into the page.
              "ml-2 mr-[-1px] rounded-l-md rounded-r-none border-y border-l border-border-1 bg-accent/30 font-medium text-fg-1",
              // When collapsed, the active item is 10 px wider than a
              // non-active one (1-px left border + 9 px right bleed)
              // and `justify-center` would shift the icon ~5 px right
              // of the rail's visual centreline. Pad-right pulls the
              // centred icon back so the active and non-active icons
              // line up perfectly down the rail.
              collapsed && "pr-[10px]",
            )
          : "mx-2 rounded-md font-normal text-fg-2 hover:bg-bg-3 hover:text-fg-1",
      )}
    >
      <SidebarItemContent Icon={Icon} label={item.label} collapsed={collapsed} />
    </Link>
  );
}

/**
 * Inner content of a sidebar Link. Lives in a child component so we
 * can call `useLinkStatus()` — Next's hook for "is the user navigating
 * to me right now". When pending, we swap the icon for a tiny spinner
 * so the user gets instant click feedback even though the underlying
 * RSC request is still in flight. Combined with `loading.tsx`
 * boundaries on the destination route, this kills the "click → nothing"
 * dead zone.
 */
function SidebarItemContent({
  Icon,
  label,
  collapsed,
}: {
  Icon: typeof Briefcase;
  label: string;
  collapsed: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <Icon className="h-4 w-4 shrink-0" />
      )}
      {!collapsed ? label : null}
    </>
  );
}
