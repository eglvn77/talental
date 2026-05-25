"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  /** Owner-only: hidden from admins + recruiters. */
  ownerOnly?: boolean;
  /** Admin-only: hidden from recruiters. */
  adminOnly?: boolean;
};

const TABS: Tab[] = [
  { href: "/settings/profile", label: "Mi perfil" },
  { href: "/settings/team", label: "Equipo", adminOnly: true },
  { href: "/settings/workspace", label: "Workspace", adminOnly: true },
  {
    href: "/settings/custom-fields",
    label: "Campos personalizados",
    adminOnly: true,
  },
  { href: "/settings/processes", label: "Procesos", adminOnly: true },
  { href: "/settings/prompts", label: "Prompts", ownerOnly: true },
];

export function SettingsNav({
  isAdmin,
  isOwner,
}: {
  /** Owner is also an admin; recruiters get only "Mi perfil". */
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const pathname = usePathname() ?? "";
  const visible = TABS.filter((t) => {
    if (t.ownerOnly) return isOwner;
    if (t.adminOnly) return isAdmin;
    return true;
  });
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
