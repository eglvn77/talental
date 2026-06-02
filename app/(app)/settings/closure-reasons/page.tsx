import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { hiring, type JobClosureReasonRow } from "@/lib/hiring";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { ClosureReasonsList } from "./closure-reasons-list";

export const dynamic = "force-dynamic";

export default async function ClosureReasonsSettingsPage() {
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");
  const t = await getT();
  const db = await hiring();
  const { data } = await db
    .from("job_closure_reasons")
    .select("*")
    .order("position", { ascending: true });
  const rows = (data ?? []) as JobClosureReasonRow[];

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">
            {t("closureReasonsCfg.heading")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("closureReasonsCfg.description")}
          </p>
        </div>
        <ClosureReasonsList initialRows={rows} />
      </section>
    </>
  );
}
