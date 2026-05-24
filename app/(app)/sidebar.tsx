"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BookUser,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  Handshake,
  LogOut,
  Settings,
  UserSearch,
} from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/login/actions";
import { SearchTrigger } from "./_components/search-command";
import { GlobalCreateMenu } from "./_components/global-create-menu";
import { Wordmark } from "@/components/brand/Wordmark";
import { Mark } from "@/components/brand/Mark";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof Briefcase;
  matchPrefix?: string;
  enabled?: boolean;
};

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
    href: "/deals",
    label: "CRM",
    Icon: Handshake,
    matchPrefix: "/deals",
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
  {
    href: "/finances",
    label: "Finanzas",
    Icon: Banknote,
    matchPrefix: "/finances",
    enabled: true,
  },
];

const STORAGE_KEY = "tlt_sidebar_collapsed";

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
    // 220-px sidebar starves the rest of the page on mobile.
    try {
      if (window.matchMedia("(max-width: 767px)").matches) {
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapsed() {
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

  return (
    <aside
      aria-label="Navegación principal"
      // Right divider is painted as an inset box-shadow instead of
      // `border-r` so the active nav item can extend its background
      // to (and slightly past) the right edge without leaving the 1-px
      // border line visible at that row. Children paint on top of the
      // inset shadow.
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-bg-2 shadow-[inset_-1px_0_0_var(--border-1)] transition-[width] duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Header — brand + collapse toggle.
          Expanded: wordmark on the left (links to /jobs), collapse
          toggle on the right.
          Collapsed: the Mark itself BECOMES the expand trigger — no
          second button beneath it. Cleaner header at narrow width;
          the user reaches /jobs by expanding first and clicking
          Vacantes (one extra click, but acceptable since the rail is
          already in compact mode).
          Divider uses border-1 to match the sidebar right edge. */}
      <div
        className={cn(
          "flex border-b border-border-1",
          collapsed
            ? "h-14 items-center justify-center px-2"
            : "h-14 items-center justify-between px-3",
        )}
      >
        {collapsed ? (
          // Small chevron-right glued to the Mark serves as the
          // affordance hint — without it new users have no signal
          // that the logo is the expand trigger. Muted color so it
          // reads as decoration, not a primary control. Tooltip
          // still says "Expandir" for screen readers.
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expandir barra"
            title="Expandir"
            className="flex items-center gap-0.5 rounded p-1 transition-colors hover:bg-bg-3"
          >
            <Mark size="md" />
            <ChevronRight className="h-3 w-3 text-fg-muted" />
          </button>
        ) : (
          <>
            <Link href="/jobs" aria-label="Talental — inicio">
              <Wordmark size="md" />
            </Link>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="rounded p-1 text-fg-muted transition-colors hover:bg-bg-3 hover:text-fg-1"
              aria-label="Colapsar barra"
              title="Colapsar"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-2 pt-2">
        <GlobalCreateMenu collapsed={collapsed} />
        <SearchTrigger collapsed={collapsed} />
      </div>

      {/* Items handle their own left padding so the active item can
          extend cleanly to the sidebar's right edge (and 1 px past it
          to overdraw the inset divider). The nav itself only manages
          vertical scroll + spacing. */}
      <nav aria-label="Secciones" className="flex-1 overflow-y-auto overflow-x-clip py-2">
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
