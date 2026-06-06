import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { hiring, getRequestWorkspaceId } from "@/lib/hiring";
import { SettingsTabsServer } from "../../_components/settings-tabs-server";
import {
  SopTemplateEditor,
  type SopTemplateInitial,
} from "./sop-template-editor";

export const dynamic = "force-dynamic";

/**
 * /settings/resources/sop — workspace-customizable SOP template editor.
 *
 * Loads the template_json off the workspace's seeded 'sop' definition
 * and hands it to a client editor. Save round-trips through
 * updateSopTemplateAction (full replace). Per-job done-state is NOT
 * touched here — it lives in resource_values and only the per-job
 * SOP page reads/writes it.
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
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Link
                href="/settings/resources"
                className="inline-flex items-center gap-0.5 hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" />
                {t("resourcesCfg.heading")}
              </Link>
            </div>
            <h2 className="mt-0.5 text-sm font-semibold">
              {data.label as string}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("sopCfg.description")}
            </p>
          </div>
        </div>
        <SopTemplateEditor initial={initial} />
      </section>
    </>
  );
}
