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
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-2.5 py-1.5 transition-colors",
              active
                ? "bg-foreground/[0.07] font-medium text-foreground"
                : "font-normal text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground",
            )}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute left-1 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-accent"
              />
            ) : null}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
