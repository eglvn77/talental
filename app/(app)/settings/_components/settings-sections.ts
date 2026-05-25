// Pure data + visibility helpers for the settings surfaces. Lives in
// a non-"use client" module so both the server tile grid and the
// client tab row can import from it without dragging client-reference
// proxies through the server bundle.
//
// Previously this lived next to <SettingsTabs/> in settings-nav.tsx
// (which has "use client" because of usePathname). When a server
// component (the tile grid) imported SETTINGS_SECTIONS from that
// module, Next.js wrapped every export — including the lucide Icon
// component references stored in each section — as client references.
// Rendering <Icon /> from the server component then failed.
import {
  GitFork,
  SlidersHorizontal,
  Sparkles,
  User,
  Users,
} from "lucide-react";

export type SettingsSectionId =
  | "profile"
  | "team"
  | "custom-fields"
  | "processes"
  | "prompts";

export type SettingsSection = {
  id: SettingsSectionId;
  href: string;
  label: string;
  description: string;
  Icon: typeof User;
  ownerOnly?: boolean;
  adminOnly?: boolean;
  group: "account" | "workspace" | "data" | "ai";
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
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
}): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => {
    if (s.ownerOnly) return isOwner;
    if (s.adminOnly) return isAdmin;
    return true;
  });
}
