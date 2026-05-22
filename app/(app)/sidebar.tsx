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
  { href: "#", label: "Candidatos", Icon: UserSearch, enabled: false },
  { href: "#", label: "CRM", Icon: Handshake, enabled: false },
  {
    href: "/companies",
    label: "Empresas",
    Icon: Building2,
    matchPrefix: "/companies",
    enabled: true,
  },
  { href: "#", label: "Contactos", Icon: BookUser, enabled: false },
];

const STORAGE_KEY = "tlt_sidebar_collapsed";

export function AdminSidebar() {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);

  // Hydrate from localStorage after mount. Starting expanded matches the
  // SSR output so React doesn't complain about a hydration mismatch.
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
      className={cn(
        "flex shrink-0 flex-col border-r border-border bg-accent transition-[width] duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-border/60",
          collapsed ? "justify-center px-2" : "justify-between px-3",
        )}
      >
        <SettingsMenu collapsed={collapsed} />
        {!collapsed ? (
          <Link
            href="/jobs"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Talental
          </Link>
        ) : null}
        {!collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Colapsar barra"
            title="Colapsar"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 px-2 py-2">
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

      {collapsed ? (
        <div className="border-t border-border/60 p-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-8 w-full items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Expandir barra"
            title="Expandir"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
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
            "rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
            collapsed ? "h-8 w-8" : "h-8 w-8",
            "flex items-center justify-center",
          )}
          aria-label="Configuración"
          title="Configuración"
        >
          <Settings className="h-4 w-4" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[180px] overflow-hidden rounded-md border border-border bg-background p-1 text-sm shadow-md"
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
          <form action={signOutAction}>
            <Dropdown.Item asChild>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus:bg-muted"
              >
                <LogOut className="h-3.5 w-3.5" />
                Cerrar sesión
              </button>
            </Dropdown.Item>
          </form>
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
    "flex items-center rounded-md text-sm transition-colors",
    collapsed ? "h-8 w-full justify-center" : "h-8 gap-2.5 px-2.5",
  );

  if (!item.enabled) {
    return (
      <span
        className={cn(base, "cursor-not-allowed text-muted-foreground/50")}
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
      className={cn(
        base,
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? item.label : null}
    </Link>
  );
}
