"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Handshake,
  Package,
  Settings,
  Share2,
  StickyNote,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { useT } from "@/lib/i18n/client";

type Tab = {
  slug: string;
  labelKey: string;
  Icon: typeof Users;
  hidden: boolean;
  /** Visible only when the job has kickoff content (overview populated). */
  kickoffOnly?: boolean;
  /** Visible only to workspace admins. */
  adminOnly?: boolean;
};

// Reading order: candidates first (the day-to-day work), then the
// public posting (what the world sees), notes (internal commentary),
// the "Paquete" — the dossier of role-config / requirements /
// sourcing / sequencing / interview format that the recruiter
// references — then reports, commercial terms, and config. The
// older /overview /requirements /outreach /interviews /portal
// folders were folded into Paquete; their slugs aren't surfaced as
// tabs any more (the directories will be removed in a follow-up).
const TABS: Tab[] = [
  { slug: "", labelKey: "jobTabs.candidates", Icon: Users, hidden: false },
  { slug: "posting", labelKey: "jobTabs.posting", Icon: Briefcase, hidden: false },
  { slug: "notes", labelKey: "jobTabs.notes", Icon: StickyNote, hidden: false },
  { slug: "paquete", labelKey: "jobTabs.paquete", Icon: Package, hidden: false, kickoffOnly: true },
  { slug: "reports", labelKey: "jobTabs.reports", Icon: BarChart3, hidden: !FEATURE_FLAGS.jobReportsTab },
  { slug: "terms", labelKey: "jobTabs.terms", Icon: Handshake, hidden: false, adminOnly: true },
  { slug: "portal", labelKey: "jobTabs.portal", Icon: Share2, hidden: false, adminOnly: true },
  { slug: "settings", labelKey: "jobTabs.settings", Icon: Settings, hidden: false },
];

export function JobTabs({
  jobId,
  hasKickoff,
  isAdmin = false,
}: {
  jobId: string;
  hasKickoff: boolean;
  /**
   * Surfaces admin-only tabs (Términos). Resolved server-side in the
   * job layout and passed in; defaults to false so non-admin callers
   * can't accidentally surface admin tabs.
   */
  isAdmin?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const t = useT();
  const base = `/jobs/${jobId}`;
  const visible = TABS.filter(
    (tab) =>
      !tab.hidden &&
      (!tab.kickoffOnly || hasKickoff) &&
      (!tab.adminOnly || isAdmin),
  );
  return (
    // Flex-1 + overflow-x-auto so the tab list shrinks gracefully on
    // small viewports — tabs scroll horizontally instead of wrapping
    // onto a second line, which would push the Filtros/Vista actions
    // slot down. Bottom border lives on the parent row so the
    // underline is unbroken across the actions slot too.
    <nav
      aria-label={t("jobTabs.tabsAria")}
      className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
    >
      {visible.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = tab.slug
          ? pathname.startsWith(href)
          : pathname === base;
        const Icon = tab.Icon;
        return (
          <Link
            key={tab.slug || "default"}
            href={href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-accent font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
