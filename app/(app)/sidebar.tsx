"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookUser,
  Briefcase,
  Building2,
  Handshake,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserSearch,
} from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/login/actions";
import { SearchTrigger } from "./_components/search-command";
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
];

const STORAGE_KEY = "tlt_sidebar_collapsed";

export function AdminSidebar() {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setCollapsed(true);
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
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-foreground/10 bg-card transition-[width] duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Header — brand + collapse toggle.
          Expanded: wordmark on the left, toggle on the right.
          Collapsed: just the dot logo (which is itself the link home);
          the toggle moves below so the dot reads as a single mark.
          Divider uses foreground/10 to match the sidebar right edge. */}
      <div
        className={cn(
          "flex border-b border-foreground/10",
          collapsed
            ? "flex-col items-center gap-1 px-2 py-2"
            : "h-14 items-center justify-between px-3",
        )}
      >
        <Link href="/jobs" aria-label="Talental — inicio">
          {collapsed ? <Mark size="md" /> : <Wordmark size="md" />}
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="rounded p-1 text-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          aria-label={collapsed ? "Expandir barra" : "Colapsar barra"}
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <div className="px-2 pt-2">
        <SearchTrigger collapsed={collapsed} />
      </div>

      <nav aria-label="Secciones" className="flex-1 overflow-y-auto px-2 py-2">
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
          Divider matches the sidebar's right edge: foreground/10. */}
      <div
        className={cn(
          "border-t border-foreground/10 p-2",
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
            "flex items-center rounded-md font-normal text-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
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
          className="z-50 min-w-[180px] overflow-hidden rounded-md border border-border bg-background p-1 text-sm shadow-dropdown"
        >
          <Dropdown.Item asChild>
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded px-2 py-1.5 text-foreground outline-none hover:bg-muted focus:bg-muted"
            >
              <Settings className="h-3.5 w-3.5" />
              Configuración
            </Link>
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-border" />
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
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus:bg-muted"
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

  const base = cn(
    "relative flex items-center rounded-md text-sm transition-colors",
    collapsed ? "h-8 w-full justify-center" : "h-8 gap-2.5 px-2.5",
  );

  if (!item.enabled) {
    return (
      <span
        className={cn(base, "cursor-not-allowed text-foreground/30")}
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
          ? "bg-foreground/[0.07] font-medium text-foreground"
          : "font-normal text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {/* Active indicator: 4px accent dot, absolutely positioned.
          Expanded: pinned to the left edge inside the rounded corner.
          Collapsed: pinned to the top-right corner of the icon so the
          dot reads as a corner pip rather than overlapping the icon. */}
      {active ? (
        <span
          aria-hidden
          className={cn(
            "absolute h-1 w-1 rounded-full bg-accent",
            collapsed
              ? "right-1.5 top-1.5"
              : "left-1 top-1/2 -translate-y-1/2",
          )}
        />
      ) : null}
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? item.label : null}
    </Link>
  );
}
