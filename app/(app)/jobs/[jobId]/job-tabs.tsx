"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  ClipboardList,
  GitBranch,
  Handshake,
  ListChecks,
  MessagesSquare,
  Send,
  Settings,
  StickyNote,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

type Tab = {
  slug: string;
  label: string;
  Icon: typeof Users;
  hidden: boolean;
  /** Visible only when the job has kickoff content (overview populated). */
  kickoffOnly?: boolean;
  /** Visible only to workspace admins. */
  adminOnly?: boolean;
};

const TABS: Tab[] = [
  { slug: "", label: "Candidatos", Icon: Users, hidden: false },
  { slug: "notes", label: "Notas", Icon: StickyNote, hidden: false },
  { slug: "overview", label: "Resumen", Icon: ClipboardList, hidden: false, kickoffOnly: true },
  { slug: "requirements", label: "Requisitos", Icon: ListChecks, hidden: false, kickoffOnly: true },
  { slug: "outreach", label: "Búsqueda y Contacto", Icon: Send, hidden: false, kickoffOnly: true },
  { slug: "interviews", label: "Entrevistas", Icon: MessagesSquare, hidden: false, kickoffOnly: true },
  { slug: "description", label: "Descripción", Icon: Briefcase, hidden: false },
  { slug: "portal", label: "Portal de la empresa", Icon: GitBranch, hidden: false },
  { slug: "reports", label: "Reportes", Icon: BarChart3, hidden: !FEATURE_FLAGS.jobReportsTab },
  { slug: "terms", label: "Términos", Icon: Handshake, hidden: false, adminOnly: true },
  { slug: "settings", label: "Ajustes", Icon: Settings, hidden: false },
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
  const base = `/jobs/${jobId}`;
  const visible = TABS.filter(
    (t) =>
      !t.hidden &&
      (!t.kickoffOnly || hasKickoff) &&
      (!t.adminOnly || isAdmin),
  );
  return (
    // Flex-1 + overflow-x-auto so the tab list shrinks gracefully on
    // small viewports — tabs scroll horizontally instead of wrapping
    // onto a second line, which would push the Filtros/Vista actions
    // slot down. Bottom border lives on the parent row so the
    // underline is unbroken across the actions slot too.
    <nav
      aria-label="Tabs de la vacante"
      className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
    >
      {visible.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const active = t.slug
          ? pathname.startsWith(href)
          : pathname === base;
        const Icon = t.Icon;
        return (
          <Link
            key={t.slug || "default"}
            href={href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-accent font-medium text-foreground"
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
