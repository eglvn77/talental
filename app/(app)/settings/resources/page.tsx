import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { hiring, type ResourceDefinitionRow } from "@/lib/hiring";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { ResourcesList } from "./resources-list";

export const dynamic = "force-dynamic";

/**
 * /settings/resources — manage the workspace's "Paquete / Resources"
 * sections. Phase 3a is the read-only-ish first cut: rename, reorder,
 * enable/disable, and inspect the system seed. Custom definitions,
 * delete, and schema editing land in a later commit.
 *
 * System rows show as locked on `key` and `kind` (column-mapped to
 * legacy jobs columns; renaming the slug would orphan the mirror
 * trigger). Label / position / is_enabled are always editable, even
 * on system rows.
 */
export default async function ResourcesSettingsPage() {
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");
  const t = await getT();
  const db = await hiring();
  const { data } = await db
    .from("resource_definitions")
    .select("*")
    .order("position", { ascending: true });
  const rows = (data ?? []) as ResourceDefinitionRow[];

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">
            {t("resourcesCfg.heading")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("resourcesCfg.description")}
          </p>
        </div>
        <ResourcesList initialRows={rows} />
      </section>
    </>
  );
}
