"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/profile", label: "Mi perfil" },
  { href: "/settings/team", label: "Equipo" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/custom-fields", label: "Campos personalizados" },
];

export function SettingsNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {TABS.map((t) => {
        const active =
          pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-md px-2.5 py-1.5 transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
