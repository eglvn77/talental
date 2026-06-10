import { redirect } from "next/navigation";
import { hiring, type MessageTemplateRow } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { TemplatesList } from "./_components/templates-list";

export const dynamic = "force-dynamic";

export default async function MessageTemplatesPage() {
  // Admin-only — workspace-wide communication library, not per-recruiter.
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");

  const t = await getT();
  const db = await hiring();
  const { data: rows } = await db
    .from("message_templates")
    .select("id, name, subject, content, position")
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  const templates = ((rows ?? []) as MessageTemplateRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    subject: r.subject,
    content: r.content,
  }));

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {t("templatesCfg.pageIntro")}
        </p>
        <TemplatesList initialTemplates={templates} />
      </section>
    </>
  );
}
