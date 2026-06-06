import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import {
  SopTemplateEditor,
  type SopTemplateInitial,
} from "./sop-template-editor";

export const dynamic = "force-dynamic";

/**
 * /settings/sop — workspace-customizable SOP template editor. Lives
 * as a sibling tab to Resources under the Jobs module. The SOP still
 * persists as a `resource_definitions` row with key='sop' (so the
 * per-job SOP page keeps reading it), but UX-wise it's its own
 * top-level configuration surface — recruiters look for "SOP", not
 * "Resources > SOP".
 */
export default async function SopTemplateSettingsPage() {
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");
  const t = await getT();
  const workspaceId = await getRequestWorkspaceId();
  const db = await hiring();
  const { data, error } = await db
    .from("resource_definitions")
    .select("id, label, template_json")
    .eq("workspace_id", workspaceId)
    .eq("key", "sop")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const tj = (data.template_json ?? {}) as {
    phases?: SopTemplateInitial["phases"];
    items?: SopTemplateInitial["items"];
  };
  const initial: SopTemplateInitial = {
    phases: Array.isArray(tj.phases) ? tj.phases : [],
    items: Array.isArray(tj.items) ? tj.items : [],
  };

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">{data.label as string}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("sopCfg.description")}
          </p>
        </div>
        <SopTemplateEditor initial={initial} />
      </section>
    </>
  );
}
