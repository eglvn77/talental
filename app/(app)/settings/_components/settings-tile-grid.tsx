import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  visibleSettingsSections,
  type SettingsSectionId,
} from "./settings-sections";

const GROUP_ORDER = ["account", "workspace", "data", "ai"] as const;
const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], string> = {
  account: "Mi cuenta",
  workspace: "Workspace",
  data: "Datos y flujo",
  ai: "Inteligencia artificial",
};

/**
 * Index of /settings — Notion/Leonar-style grouped cards. Server
 * component because the visibility math (admin/owner) is resolved
 * server-side already, so no need to ship the section list to the
 * client when this is the only consumer for this surface.
 */
export function SettingsTileGrid({
  isAdmin,
  isOwner,
}: {
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const visible = visibleSettingsSections({ isAdmin, isOwner });
  // Bucket by group, preserving the SETTINGS_SECTIONS declaration
  // order so the cards within each group keep the canonical order.
  const buckets: Record<string, typeof visible> = {};
  for (const s of visible) {
    (buckets[s.group] ??= []).push(s);
  }
  const orderedGroups = GROUP_ORDER.filter((g) => buckets[g]?.length);

  return (
    <div className="space-y-7">
      {orderedGroups.map((g) => (
        <section key={g} className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {GROUP_LABEL[g]}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {buckets[g].map((s) => (
              <SettingsTile
                key={s.id}
                id={s.id}
                href={s.href}
                label={s.label}
                description={s.description}
                Icon={s.Icon}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SettingsTile({
  href,
  label,
  description,
  Icon,
}: {
  id: SettingsSectionId;
  href: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-start gap-3 rounded-lg border border-border bg-bg-1 px-4 py-3.5 transition-colors hover:border-foreground/15 hover:bg-bg-2"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {description}
        </div>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
    </Link>
  );
}
