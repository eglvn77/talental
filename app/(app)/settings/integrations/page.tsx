import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/team";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { IntegrationsList, type ConnectedAccountItem } from "./_components/integrations-list";

export const dynamic = "force-dynamic";

/**
 * Settings → Integrations. Connect the channels whose inbound messages
 * feed the Conversations inbox (and, separately, power Sequences
 * sending): LinkedIn, Gmail, WhatsApp.
 *
 * A channel is only MONITORED once its account sits in
 * hiring.connected_accounts — the Unipile webhook resolves the
 * workspace for each inbound message by matching unipile_account_id
 * against this table. This page is where the admin connects/reconnects
 * accounts so that resolution succeeds.
 */
export default async function IntegrationsSettingsPage() {
  const t = await getT();
  const me = await getCurrentUser();
  if (me && !isAdmin(me.team_member)) redirect("/settings");

  const db = await hiring();
  const { data: rows } = await db
    .from("connected_accounts")
    .select("id, provider, status, account_metadata, last_status_update")
    .order("created_at", { ascending: true });

  const accounts: ConnectedAccountItem[] = (
    (rows ?? []) as Array<{
      id: string;
      provider: string;
      status: string;
      account_metadata: Record<string, unknown> | null;
      last_status_update: string | null;
    }>
  ).map((r) => ({
    id: r.id,
    provider: r.provider,
    status: r.status,
    label:
      (r.account_metadata?.email as string | undefined) ??
      (r.account_metadata?.name as string | undefined) ??
      (r.account_metadata?.phone as string | undefined) ??
      null,
    lastUpdate: r.last_status_update,
  }));

  return (
    <>
      <SettingsTabsServer />
      <section className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {t("integrations.intro")}
        </p>
        <IntegrationsList accounts={accounts} />
      </section>
    </>
  );
}
