"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  ClipboardList,
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
  // Package leads the tab row — it's the dossier the recruiter spends
  // the most time inside. The default landing route stays Candidates
  // (slug=""), so first navigation to a vacante still lands on the
  // pipeline, but the Package tab visually anchors the row and gets
  // its hover-menu treatment in <JobTabs>.
  { slug: "paquete", labelKey: "jobTabs.paquete", Icon: Package, hidden: false, kickoffOnly: true },
  { slug: "", labelKey: "jobTabs.candidates", Icon: Users, hidden: false },
  { slug: "posting", labelKey: "jobTabs.posting", Icon: Briefcase, hidden: false },
  { slug: "notes", labelKey: "jobTabs.notes", Icon: StickyNote, hidden: false },
  { slug: "reports", labelKey: "jobTabs.reports", Icon: BarChart3, hidden: !FEATURE_FLAGS.jobReportsTab },
  { slug: "terms", labelKey: "jobTabs.terms", Icon: Handshake, hidden: false, adminOnly: true },
  { slug: "portal", labelKey: "jobTabs.portal", Icon: Share2, hidden: false, adminOnly: true },
  // SOP is the daily-driver playbook for working a vacante. Lifted out
  // of Paquete (its own checklist of internal-process steps deserves a
  // top-level home) and parked right before Settings. Always visible —
  // the template is company-wide and applies even before kickoff runs.
  { slug: "sop", labelKey: "jobTabs.sop", Icon: ClipboardList, hidden: false },
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
        // The Package tab gets two custom treatments: a subtle
        // resting highlight (so it reads as the headline tab without
        // looking selected) and a hover-revealed sub-section menu.
        if (tab.slug === "paquete") {
          return (
            <PackageTab
              key="paquete"
              href={href}
              active={active}
              label={t(tab.labelKey)}
              Icon={Icon}
            />
          );
        }
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

/**
 * The Package tab is the dossier's front door — it leads the tab row
 * and gets two flourishes:
 *   1. A soft amber tint at rest so it reads as the headline tab
 *      without competing with the selected-state underline.
 *   2. A hover-revealed dropdown listing the Package's internal
 *      sub-sections (Requirements, Sourcing, Outreach Sequence,
 *      Interview Process, AI Interview, Script, Calibration) so the
 *      recruiter can jump straight into one and skip an extra click.
 */
function PackageTab({
  href,
  active,
  label,
  Icon,
}: {
  href: string;
  active: boolean;
  label: string;
  Icon: typeof Users;
}) {
  const t = useT();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });
  // Recompute the portal position whenever the menu opens or the
  // window resizes. Reads the trigger's bounding rect so the menu
  // sits directly under the Package tab regardless of how far the
  // parent <nav> has been horizontally scrolled.
  useEffect(() => {
    if (!open || !wrapperRef.current) return;
    function reposition() {
      if (!wrapperRef.current) return;
      const r = wrapperRef.current.getBoundingClientRect();
      setCoords({ left: r.left, top: r.bottom });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const SUB_SECTIONS: Array<{ key: string; labelKey: string }> = [
    { key: "req", labelKey: "kickoff.tabRequirements" },
    { key: "sourcing", labelKey: "kickoff.tabSourcing" },
    { key: "seq", labelKey: "kickoff.tabSequence" },
    { key: "proc", labelKey: "kickoff.tabProcess" },
    { key: "appq", labelKey: "kickoff.tabApplicationQuestions" },
    { key: "aiq", labelKey: "kickoff.tabAiInterview" },
    { key: "script", labelKey: "kickoff.tabScript" },
    { key: "feedback", labelKey: "kickoff.tabFeedback" },
  ];
  return (
    <div
      ref={wrapperRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="relative"
    >
      <Link
        href={href}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
          active
            ? "border-accent font-medium text-foreground"
            : "border-transparent bg-[#D9A26E]/12 text-foreground hover:bg-[#D9A26E]/20",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Link>
      {/* Portal so the dropdown escapes the <nav>'s overflow-x-auto
          clipping context and floats above every other layer. */}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
              style={{
                position: "fixed",
                left: coords.left,
                top: coords.top,
                zIndex: 200,
              }}
              className="min-w-[200px] rounded-md border border-border bg-card p-1 shadow-dropdown"
            >
              {SUB_SECTIONS.map((s) => (
                <Link
                  key={s.key}
                  href={`${href}?tab=${s.key}`}
                  onClick={() => setOpen(false)}
                  className="block rounded px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {t(s.labelKey)}
                </Link>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
