import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hiring, type CustomFieldDefinitionRow } from "@/lib/hiring";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { ENTITIES, ENTITY_LABEL, isEntityType } from "../../_lib/entities";
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

  const db = await hiring();
  const { data } = await db
    .from("custom_field_definitions")
    .select("*")
    .eq("entity_type", entity)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const fields = (data ?? []) as CustomFieldDefinitionRow[];

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Campos personalizados</h2>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {ENTITIES.map((e) => (
          <Link
            key={e}
            href={`/settings/custom-fields/${e}`}
            className={cn(
              "border-b-2 px-3 py-2 text-sm transition-colors",
              e === entity
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {ENTITY_LABEL[e]}
          </Link>
        ))}
      </div>

      <FieldList entity={entity} initialFields={fields} />
    </section>
  );
}
