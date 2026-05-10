"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  GitBranch,
  Send,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// `slug` is the URL segment after /jobs/[jobId]. Empty string = default page
// (the kanban). Order in this list = visible order in the tabs nav.
const TABS = [
  { slug: "", label: "Candidatos", Icon: Users },
  { slug: "description", label: "Descripción de puesto", Icon: Briefcase },
  { slug: "sequence", label: "Secuencia", Icon: Send },
  { slug: "portal", label: "Portal del cliente", Icon: GitBranch },
  { slug: "reports", label: "Reportes", Icon: BarChart3 },
  { slug: "settings", label: "Ajustes", Icon: Settings },
] as const;

export function RoleTabs({ roleId }: { roleId: string }) {
  const pathname = usePathname() ?? "";
  const base = `/jobs/${roleId}`;
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
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
                ? "border-foreground font-medium text-foreground"
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
