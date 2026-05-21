"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; ownerOnly?: boolean };

const TABS: Tab[] = [
  { href: "/settings/profile", label: "Mi perfil" },
  { href: "/settings/team", label: "Equipo" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/custom-fields", label: "Campos personalizados" },
  { href: "/settings/prompts", label: "Prompts", ownerOnly: true },
];

export function SettingsNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname() ?? "";
  const visible = TABS.filter((t) => !t.ownerOnly || isOwner);
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {visible.map((t) => {
        const active =
          pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-md px-2.5 py-1.5 transition-colors",
              active
                ? "bg-accent text-foreground"
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
