"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  GitBranch,
  LayoutGrid,
  Send,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

// `slug` is the URL segment after /jobs/[jobId]. Empty string = default page
// (the kanban). Order in this list = visible order in the tabs nav.
// `hidden` defers to a feature flag; the routes still resolve so anyone with
// a deep link reaches the page, only the tab nav hides.
type Tab = {
  slug: string;
  label: string;
  Icon: typeof Users;
  hidden: boolean;
  /** Visible only when the job has kickoff content (overview populated). */
  kickoffOnly?: boolean;
};

const TABS: Tab[] = [
  { slug: "", label: "Candidatos", Icon: Users, hidden: false },
  { slug: "setup", label: "Setup", Icon: LayoutGrid, hidden: false, kickoffOnly: true },
  { slug: "description", label: "Descripción de puesto", Icon: Briefcase, hidden: false },
  // TODO: re-enable when sequences/reports module ships
  { slug: "sequence", label: "Secuencia", Icon: Send, hidden: !FEATURE_FLAGS.jobSequencesTab },
  { slug: "portal", label: "Portal del cliente", Icon: GitBranch, hidden: false },
  { slug: "reports", label: "Reportes", Icon: BarChart3, hidden: !FEATURE_FLAGS.jobReportsTab },
  { slug: "settings", label: "Ajustes", Icon: Settings, hidden: false },
];

export function JobTabs({
  jobId,
  hasKickoff,
}: {
  jobId: string;
  hasKickoff: boolean;
}) {
  const pathname = usePathname() ?? "";
  const base = `/jobs/${jobId}`;
  const visible = TABS.filter(
    (t) => !t.hidden && (!t.kickoffOnly || hasKickoff),
  );
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {visible.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        // Default tab is active only when the path is exactly the base.
        // Sub-tabs match when the path starts with their full href.
        const active = t.slug
          ? pathname.startsWith(href)
          : pathname === base;
        const Icon = t.Icon;
        return (
          <Link
            key={t.slug || "default"}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-brand font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
