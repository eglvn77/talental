import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { getT } from "@/lib/i18n/server";
import { hiring, type RejectionReasonRow } from "@/lib/hiring";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { RejectionReasonsList } from "./rejection-reasons-list";

export const dynamic = "force-dynamic";

export default async function RejectionReasonsSettingsPage() {
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");
  const t = await getT();
  const db = await hiring();
  const { data } = await db
    .from("rejection_reasons")
    .select("*")
    .order("position", { ascending: true });
  const rows = (data ?? []) as RejectionReasonRow[];

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">
            {t("rejectionReasonsCfg.heading")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("rejectionReasonsCfg.description")}
          </p>
        </div>
        <RejectionReasonsList initialRows={rows} />
      </section>
    </>
  );
}
