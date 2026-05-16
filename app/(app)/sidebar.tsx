"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Building2,
  Handshake,
  Inbox,
  Search,
  Send,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof Inbox;
  matchPrefix?: string;
  enabled?: boolean;
};

type NavGroup = {
  label: string | null;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      {
        href: "/jobs",
        label: "Vacantes",
        Icon: Briefcase,
        matchPrefix: "/jobs",
        enabled: true,
      },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { href: "#", label: "Bandeja", Icon: Inbox, enabled: false },
      { href: "#", label: "Contactos", Icon: Users, enabled: false },
      { href: "#", label: "Secuencias", Icon: Send, enabled: false },
    ],
  },
  {
    label: "CRM",
    items: [
      {
        href: "/companies",
        label: "Empresas",
        Icon: Building2,
        matchPrefix: "/companies",
        enabled: true,
      },
      { href: "#", label: "Negocios", Icon: Handshake, enabled: false },
    ],
  },
  {
    label: "Insights",
    items: [{ href: "#", label: "Reportes", Icon: BarChart3, enabled: false }],
  },
];

export function AdminSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-background">
      <Link
        href="/jobs"
        className="flex h-14 items-center gap-2 px-5 text-base font-semibold tracking-tight text-foreground"
      >
        Talental
      </Link>

      <div className="px-3 pb-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          disabled
        >
          <Search className="h-3.5 w-3.5" />
          Buscar
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px]">
            ⌘K
          </span>
        </button>
      </div>

      <nav className="flex-1 px-3">
        {GROUPS.map((group, gi) => (
          <div key={gi} className="mb-4">
            {group.label ? (
              <div className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </div>
            ) : null}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <SidebarItem
                  key={item.label}
                  item={item}
                  pathname={pathname}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Settings className="h-4 w-4" />
          Configuración
        </Link>
      </div>
    </aside>
  );
}

function SidebarItem({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
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

  if (!item.enabled) {
    return (
      <span
        className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/50"
        title="Próximamente"
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
