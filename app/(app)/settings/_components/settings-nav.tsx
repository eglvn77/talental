"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GitFork,
  SlidersHorizontal,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsSectionId =
  | "profile"
  | "team"
  | "custom-fields"
  | "processes"
  | "prompts";

type Section = {
  id: SettingsSectionId;
  href: string;
  label: string;
  description: string;
  Icon: typeof User;
  ownerOnly?: boolean;
  adminOnly?: boolean;
  group: "account" | "workspace" | "data" | "ai";
};

/**
 * Canonical list of settings sections. Used by:
 *   - <SettingsTabs /> for the horizontal tab row that sits at the
 *     top of every sub-section.
 *   - <SettingsTileGrid /> on /settings (root) to surface the same
 *     items as cards grouped by area.
 *
 * Keep these in sync — both surfaces read from this list.
 */
export const SETTINGS_SECTIONS: Section[] = [
  {
    id: "profile",
    href: "/settings/profile",
    label: "Mi perfil",
    description: "Tu nombre, email y preferencias personales.",
    Icon: User,
    group: "account",
  },
  {
    id: "team",
    href: "/settings/team",
    label: "Equipo",
    description: "Nombre del equipo, miembros y roles.",
    Icon: Users,
    adminOnly: true,
    group: "workspace",
  },
  {
    id: "custom-fields",
    href: "/settings/custom-fields",
    label: "Campos personalizados",
    description: "Define columnas adicionales por entidad.",
    Icon: SlidersHorizontal,
    adminOnly: true,
    group: "data",
  },
  {
    id: "processes",
    href: "/settings/processes",
    label: "Procesos",
    description: "Plantillas de pipelines para nuevas vacantes.",
    Icon: GitFork,
    adminOnly: true,
    group: "data",
  },
  {
    id: "prompts",
    href: "/settings/prompts",
    label: "Prompts",
    description: "Plantillas de IA usadas en Kickoff y Calibrar.",
    Icon: Sparkles,
    ownerOnly: true,
    group: "ai",
  },
];

export function visibleSettingsSections({
  isAdmin,
  isOwner,
}: {
  isAdmin: boolean;
  isOwner: boolean;
}): Section[] {
  return SETTINGS_SECTIONS.filter((s) => {
    if (s.ownerOnly) return isOwner;
    if (s.adminOnly) return isAdmin;
    return true;
  });
}

/**
 * Horizontal tab row for the settings sub-sections — mirrors the
 * pattern from JobTabs so the navigation feels native to the rest
 * of the app instead of the old side-nav. Scrolls horizontally on
 * narrow viewports.
 */
export function SettingsTabs({
  isAdmin,
  isOwner,
}: {
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const pathname = usePathname() ?? "";
  const visible = visibleSettingsSections({ isAdmin, isOwner });
  return (
    <nav
      aria-label="Secciones de configuración"
      className="mb-4 flex min-w-0 gap-1 overflow-x-auto border-b border-border"
    >
      {visible.map((s) => {
        // `startsWith` so `/settings/custom-fields/job` highlights the
        // Campos tab when the user is deep-linking into an entity tab.
        const active =
          pathname === s.href || pathname.startsWith(s.href + "/");
        const Icon = s.Icon;
        return (
          <Link
            key={s.id}
            href={s.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-accent font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
