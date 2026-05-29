import { redirect } from "next/navigation";
import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { TagsList, type TagListItem } from "./_components/tags-list";

export const dynamic = "force-dynamic";

/**
 * Workspace tag manager. Admin-only.
 *
 * Tags live in hiring.tags and attach to entities via entity_tags
 * (candidates, applications, etc). They're created inline from the
 * TagPicker as the recruiter works; this screen is where they get
 * renamed, recolored, or deleted. entity_tags.tag_id has ON DELETE
 * CASCADE so deleting a tag removes it everywhere it was applied.
 *
 * Shows a usage count per tag so the admin knows what a delete will
 * detach before confirming.
 */
export default async function TagsSettingsPage() {
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");

  const db = await hiring();
  const [{ data: tagRows }, { data: links }] = await Promise.all([
    db.from("tags").select("id, name, color").order("name", { ascending: true }),
    db.from("entity_tags").select("tag_id"),
  ]);

  const usage: Record<string, number> = {};
  for (const l of (links ?? []) as Array<{ tag_id: string }>) {
    usage[l.tag_id] = (usage[l.tag_id] ?? 0) + 1;
  }

  const tags: TagListItem[] = (
    (tagRows ?? []) as Array<{ id: string; name: string; color: string | null }>
  ).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    usageCount: usage[t.id] ?? 0,
  }));

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Etiquetas que aplicas a candidatos y a candidaturas en el
          pipeline. Renómbralas, cámbiales el color, o elimínalas.
          Eliminar una etiqueta la quita de todos los lugares donde
          está aplicada.
        </p>
        <TagsList initialTags={tags} />
      </section>
    </>
  );
}
