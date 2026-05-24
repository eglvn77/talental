"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookUser,
  Briefcase,
  Building2,
  LogOut,
  Settings,
  UserSearch,
} from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/login/actions";
import { GlobalCreateMenu } from "./_components/global-create-menu";

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

const STORAGE_KEY = "tlt_sidebar_collapsed";

/**
 * Pure-navigation rail. The brand and global search now live in the
 * <TopBar> above; this component focuses on the create entry point,
 * the section list, and the settings/sign-out menu. Collapse state
 * is persisted to localStorage; it can be flipped from here OR from
 * the top-bar toggle (which dispatches `tlt:toggle-sidebar`).
 */
export function AdminSidebar() {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "1") {
        setCollapsed(true);
        return;
      }
      if (raw === "0") {
        // User explicitly expanded — honor it regardless of viewport.
        return;
      }
    } catch {
      /* ignore */
    }
    // No explicit preference saved → collapse on small viewports by
    // default so the content area gets the breathing room it needs.
    // Threshold matches Tailwind's `md:` (768px); below that the
    // 176-px sidebar starves the rest of the page on mobile.
    try {
      if (window.matchMedia("(max-width: 767px)").matches) {
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // External toggle (top-bar button) flips this same state. Wiring
  // through a window event keeps both surfaces simple — the sidebar
  // owns the collapsed state and persistence, the top bar just asks
  // it to toggle.
  useEffect(() => {
    function onToggle() {
      setCollapsed((v) => {
        const next = !v;
        try {
          window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {
          /* ignore */
        }
        return next;
      });
    }
    window.addEventListener("tlt:toggle-sidebar" as never, onToggle as never);
    return () => {
      window.removeEventListener(
        "tlt:toggle-sidebar" as never,
        onToggle as never,
      );
    };
  }, []);

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
      {/* "+ Nuevo" entry — first thing in the rail. Outline-olive so
          the active-tab below stays the single olive moment in this
          region. */}
      <div className="flex flex-col gap-1.5 px-2 pt-3">
        <GlobalCreateMenu collapsed={collapsed} />
      </div>

      {/* Items handle their own left padding so the active item can
          extend cleanly to the sidebar's right edge (and 1 px past it
          to overdraw the inset divider). The nav itself only manages
          vertical scroll + spacing. */}
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

      {/* Footer — settings gear stays pinned and visible always.
          Divider matches the sidebar's right edge: border-1. */}
      <div
        className={cn(
          "border-t border-border-1 p-2",
          collapsed ? "flex justify-center" : "",
        )}
      >
        <SettingsMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}

function SettingsMenu({ collapsed }: { collapsed: boolean }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center rounded-md font-normal text-fg-muted transition-colors hover:bg-bg-3 hover:text-fg-1",
            collapsed
              ? "h-8 w-8 justify-center"
              : "h-8 w-full gap-2.5 px-2.5 text-sm",
          )}
          aria-label="Configuración"
          title="Configuración"
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed ? "Configuración" : null}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="start"
          side="top"
          sideOffset={6}
          className="z-50 min-w-[180px] overflow-hidden rounded-md border border-border-1 bg-bg-1 p-1 text-sm shadow-dropdown"
        >
          <Dropdown.Item asChild>
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded px-2 py-1.5 text-fg-1 outline-none hover:bg-bg-3 focus:bg-bg-3"
            >
              <Settings className="h-3.5 w-3.5" />
              Configuración
            </Link>
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-border-1" />
          {/* Sign-out: preventDefault on the Radix onSelect so the menu
              doesn't close before the server action runs (the previous
              form-action pattern was racing with Radix's onSelect → menu
              close → form submit cancelled). Calling the server action
              imperatively works because Next.js routes redirect() throws
              back through the client runtime. */}
          <Dropdown.Item
            onSelect={(e) => {
              e.preventDefault();
              void signOutAction();
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-fg-muted outline-none hover:bg-bg-3 hover:text-fg-1 focus:bg-bg-3"
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
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? item.label : null}
    </Link>
  );
}
