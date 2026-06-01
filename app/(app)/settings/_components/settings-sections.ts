// Settings information architecture. Two levels:
//   - Top-level standalone entries (Profile, Team, Careers).
//   - Module groups (Jobs, Candidates, Companies, Contacts), each with
//     its own internal tabs. The settings nav renders the modules in the
//     primary row and the active module's tabs in a secondary row.
//
// Pure data + visibility helpers — no "use client" so both the server
// wrapper and the client tab row can import it without dragging client
// references through the server bundle.

export type SettingsTab = {
  id: string;
  labelKey: string;
  /** Canonical URL (may carry a query param to disambiguate shared pages). */
  href: string;
  /**
   * For pages reused across modules (the global Tags page, job/company
   * statuses) the active tab is told apart by a query param rather than
   * the path. Defaults below decide the match when the param is absent.
   */
  param?: { key: "scope" | "module"; value: string };
  adminOnly?: boolean;
  ownerOnly?: boolean;
};

export type SettingsModule = {
  id: string;
  labelKey: string;
  /** First tab — where clicking the module in the primary row lands. */
  href: string;
  adminOnly?: boolean;
  tabs: SettingsTab[];
};

/** When a shared page is opened with no disambiguating param, treat it
 *  as this value (so a bare /settings/job-statuses reads as "job"). */
export const PARAM_DEFAULTS: Record<"scope" | "module", string> = {
  scope: "job",
  module: "jobs",
};

export const TOP_LEVEL: SettingsTab[] = [
  { id: "profile", labelKey: "settings.profileLabel", href: "/settings/profile" },
  {
    id: "team",
    labelKey: "settings.teamLabel",
    href: "/settings/team",
    adminOnly: true,
  },
  {
    id: "careers",
    labelKey: "settings.careersLabel",
    href: "/settings/careers",
    adminOnly: true,
  },
  {
    id: "prompts",
    labelKey: "settings.promptsLabel",
    href: "/settings/prompts",
    ownerOnly: true,
  },
];

/** The global Tags tab, surfaced inside every module (same page; the
 *  `module` param only drives which module highlights in the nav). */
function tagsTab(moduleId: string): SettingsTab {
  return {
    id: `tags-${moduleId}`,
    labelKey: "settings.tagsLabel",
    href: `/settings/tags?module=${moduleId}`,
    param: { key: "module", value: moduleId },
  };
}

export const MODULES: SettingsModule[] = [
  {
    id: "jobs",
    labelKey: "nav.jobs",
    href: "/settings/processes",
    adminOnly: true,
    tabs: [
      {
        id: "processes",
        labelKey: "settings.processesLabel",
        href: "/settings/processes",
      },
      {
        id: "job-statuses",
        labelKey: "settings.jobStatusesLabel",
        href: "/settings/job-statuses?scope=job",
        param: { key: "scope", value: "job" },
      },
      tagsTab("jobs"),
      {
        id: "cf-job",
        labelKey: "settings.customFieldsLabel",
        href: "/settings/custom-fields/job",
      },
    ],
  },
  {
    id: "candidates",
    labelKey: "nav.candidates",
    href: "/settings/tags?module=candidates",
    adminOnly: true,
    tabs: [
      tagsTab("candidates"),
      {
        id: "cf-candidate",
        labelKey: "settings.customFieldsLabel",
        href: "/settings/custom-fields/candidate",
      },
    ],
  },
  {
    id: "companies",
    labelKey: "nav.companies",
    href: "/settings/job-statuses?scope=company",
    adminOnly: true,
    tabs: [
      {
        id: "company-statuses",
        labelKey: "settings.jobStatusesLabel",
        href: "/settings/job-statuses?scope=company",
        param: { key: "scope", value: "company" },
      },
      tagsTab("companies"),
      {
        id: "cf-company",
        labelKey: "settings.customFieldsLabel",
        href: "/settings/custom-fields/company",
      },
    ],
  },
  {
    id: "contacts",
    labelKey: "nav.contacts",
    href: "/settings/tags?module=contacts",
    adminOnly: true,
    tabs: [
      tagsTab("contacts"),
      {
        id: "cf-contact",
        labelKey: "settings.customFieldsLabel",
        href: "/settings/custom-fields/contact",
      },
    ],
  },
];

export function tabVisible(
  tab: SettingsTab,
  { isAdmin, isOwner }: { isAdmin: boolean; isOwner: boolean },
): boolean {
  if (tab.ownerOnly) return isOwner;
  if (tab.adminOnly) return isAdmin;
  return true;
}

export function visibleTabs(
  module: SettingsModule,
  flags: { isAdmin: boolean; isOwner: boolean },
): SettingsTab[] {
  return module.tabs.filter((t) => tabVisible(t, flags));
}
