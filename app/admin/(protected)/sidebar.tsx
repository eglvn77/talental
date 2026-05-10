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

const ITEMS: NavItem[] = [
  { href: "/admin/hiring", label: "Vacantes", Icon: Briefcase, matchPrefix: "/admin/hiring", enabled: true },
  { href: "#", label: "Bandeja", Icon: Inbox, enabled: false },
  { href: "#", label: "Contactos", Icon: Users, enabled: false },
  { href: "#", label: "Secuencias", Icon: Send, enabled: false },
  {
    href: "/admin/hiring/companies",
    label: "Empresas",
    Icon: Building2,
    matchPrefix: "/admin/hiring/companies",
    enabled: true,
  },
  { href: "#", label: "Negocios", Icon: Handshake, enabled: false },
  { href: "#", label: "Reportes", Icon: BarChart3, enabled: false },
];

export function AdminSidebar() {
  const pathname = usePathname() ?? "";
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/20">
      <Link
        href="/admin/hiring"
        className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-semibold text-brand"
      >
        Talental
      </Link>

      <div className="px-3 py-2">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          disabled
        >
          <Search className="h-3.5 w-3.5" />
          Buscar
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px]">
            ⌘K
          </span>
        </button>
      </div>

      <nav className="flex-1 px-2 py-1">
        {ITEMS.map((item) => {
          const active =
            item.matchPrefix &&
            (pathname === item.matchPrefix ||
              (item.matchPrefix !== "/admin/hiring" &&
                pathname.startsWith(item.matchPrefix + "/")) ||
              (item.matchPrefix === "/admin/hiring" &&
                pathname.startsWith("/admin/hiring") &&
                !pathname.startsWith("/admin/hiring/companies")));
          const Icon = item.Icon;
          if (!item.enabled) {
            return (
              <span
                key={item.label}
                className="flex cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/60"
                title="Próximamente"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
