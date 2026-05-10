"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  GitBranch,
  Send,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "tracking", label: "Tracking", Icon: SlidersHorizontal },
  { key: "job-posting", label: "Job Posting", Icon: Briefcase },
  { key: "client-portal", label: "Client Portal", Icon: GitBranch },
  { key: "sequence", label: "Sequence", Icon: Send },
  { key: "analytics", label: "Analytics", Icon: BarChart3 },
  { key: "settings", label: "Settings", Icon: Settings },
] as const;

export function RoleTabs({ roleId }: { roleId: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const href = `/admin/hiring/${roleId}/${t.key}`;
        const active = pathname?.startsWith(href);
        const Icon = t.Icon;
        return (
          <Link
            key={t.key}
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
