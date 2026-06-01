import { notFound, redirect } from "next/navigation";
import { hiring, type CustomFieldDefinitionRow } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { isEntityType } from "../../_lib/entities";
import { getT } from "@/lib/i18n/server";
import { SettingsTabsServer } from "../../_components/settings-tabs-server";
import { FieldList } from "./field-list";

export const dynamic = "force-dynamic";

export default async function CustomFieldsForEntityPage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  // Admin-only — custom field schema is workspace-wide config and
  // shouldn't be reshaped by recruiters.
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");

  const { entity } = await params;
  if (!isEntityType(entity)) notFound();
  const t = await getT();

  const db = await hiring();
  const { data } = await db
    .from("custom_field_definitions")
    .select("*")
    .eq("entity_type", entity)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const fields = (data ?? []) as CustomFieldDefinitionRow[];

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">
          {t("settings.customFieldsLabel")} · {t(`entities.${entity}`)}
        </h2>
        <FieldList entity={entity} initialFields={fields} />
      </section>
    </>
  );
}
