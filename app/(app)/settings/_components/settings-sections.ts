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
  Briefcase,
  Flag,
  GitFork,
  SlidersHorizontal,
  Sparkles,
  Tag,
  User,
  Users,
} from "lucide-react";

export type SettingsSectionId =
  | "profile"
  | "team"
  | "careers"
  | "job-statuses"
  | "custom-fields"
  | "processes"
  | "tags"
  | "prompts";

export type SettingsSection = {
  id: SettingsSectionId;
  href: string;
  /**
   * Optional prefix used for the active-tab highlight. Defaults to
   * `href` when omitted. Set this when the canonical landing URL is a
   * sub-route (e.g. /settings/custom-fields/candidate) but the tab
   * should still highlight while the user is on any sibling under
   * /settings/custom-fields/*.
   */
  matchPrefix?: string;
  /** i18n catalog key for the tab label (settings.<key>). */
  labelKey: string;
  Icon: typeof User;
  ownerOnly?: boolean;
  adminOnly?: boolean;
  group: "account" | "workspace" | "data" | "ai";
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "profile",
    labelKey: "settings.profileLabel",
    href: "/settings/profile",
    Icon: User,
    group: "account",
  },
  {
    id: "team",
    labelKey: "settings.teamLabel",
    href: "/settings/team",
    Icon: Users,
    adminOnly: true,
    group: "workspace",
  },
  {
    id: "careers",
    labelKey: "settings.careersLabel",
    href: "/settings/careers",
    Icon: Briefcase,
    adminOnly: true,
    group: "workspace",
  },
  {
    id: "custom-fields",
    labelKey: "settings.customFieldsLabel",
    // Skip the /settings/custom-fields redirect page — landing on it
    // forced a two-step navigation (redirect to /candidate) that
    // flashed the tab row off-screen between renders. Point directly
    // at the canonical default entity instead, and use `matchPrefix`
    // below so the tab still highlights on sibling entity routes
    // (/job, /company, /contact, /application, /deal).
    href: "/settings/custom-fields/candidate",
    matchPrefix: "/settings/custom-fields",
    Icon: SlidersHorizontal,
    adminOnly: true,
    group: "data",
  },
  {
    id: "processes",
    labelKey: "settings.processesLabel",
    href: "/settings/processes",
    Icon: GitFork,
    adminOnly: true,
    group: "data",
  },
  {
    id: "job-statuses",
    labelKey: "settings.jobStatusesLabel",
    href: "/settings/job-statuses",
    Icon: Flag,
    adminOnly: true,
    group: "data",
  },
  {
    id: "tags",
    labelKey: "settings.tagsLabel",
    href: "/settings/tags",
    Icon: Tag,
    adminOnly: true,
    group: "data",
  },
  {
    id: "prompts",
    labelKey: "settings.promptsLabel",
    href: "/settings/prompts",
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
