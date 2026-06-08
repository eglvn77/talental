import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { ConnectLinkedinButton } from "./connect-button";
import { DAILY_UNIPILE_LIMIT } from "@/lib/integrations/unipile/profile";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Settings → Integrations. Lists connected accounts and lets the
 * recruiter connect a LinkedIn via Unipile's Hosted Auth. The
 * LinkedIn connection feeds the extension's cascade fallback when
 * Coresignal can't index a profile.
 */
export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const t = await getT();
  const sp = await searchParams;
  const justConnected = sp.status === "success";
  const justFailed = sp.status === "failure";

  const db = await hiring();
  const { data: accounts } = await db
    .from("connected_accounts")
    .select("id, provider, status, last_status_update")
    .eq("workspace_id", me.workspace.id)
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    provider: string;
    status: string;
    last_status_update: string;
  };
  const rows = (accounts ?? []) as Row[];
  const linkedinAccount = rows.find((r) => r.provider === "LINKEDIN");

  // Daily Unipile usage counter (only meaningful when LinkedIn is
  // connected). Same definition as the runtime cap in
  // enrichCandidateViaUnipile so what you see matches what's
  // enforced.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: todayUnipileCount } = await db
    .from("candidates")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", me.workspace.id)
    .eq("enrichment_status", "unipile_ok")
    .gte("enriched_at", startOfDay.toISOString());
  const usedToday = todayUnipileCount ?? 0;
  const remaining = Math.max(0, DAILY_UNIPILE_LIMIT - usedToday);
  const pctUsed = Math.min(100, (usedToday / DAILY_UNIPILE_LIMIT) * 100);

  const isConnected = linkedinAccount?.status === "ok";

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <SettingsTabsServer />
      <h1 className="mt-6 text-2xl font-semibold">
        {t("integrationsPage.title")}
      </h1>

      {justConnected ? (
        <div className="mt-6 rounded-md border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-positive">
          {t("integrationsPage.bannerSuccess")}
        </div>
      ) : null}
      {justFailed ? (
        <div className="mt-6 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {t("integrationsPage.bannerFailure")}
        </div>
      ) : null}

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">LinkedIn</h2>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
              isConnected
                ? "bg-positive/15 text-positive"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isConnected ? "bg-positive" : "bg-muted-foreground/50"
              }`}
            />
            {isConnected
              ? t("integrationsPage.statusConnected")
              : t("integrationsPage.statusDisconnected")}
          </span>
        </div>

        <div className="mt-4">
          <ConnectLinkedinButton
            providers={["LINKEDIN"]}
            reconnectAccountId={
              !isConnected && linkedinAccount
                ? linkedinAccount.id
                : undefined
            }
            label={
              isConnected
                ? t("integrationsPage.reconnect")
                : t("integrationsPage.connect")
            }
          />
        </div>

        {isConnected ? (
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">
                {t("integrationsPage.usageTitle")}
              </h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {usedToday} / {DAILY_UNIPILE_LIMIT}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  pctUsed >= 90
                    ? "bg-danger"
                    : pctUsed >= 70
                      ? "bg-warning"
                      : "bg-positive"
                }`}
                style={{ width: `${pctUsed}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {remaining > 0
                ? t("integrationsPage.usageRemaining").replace(
                    "{count}",
                    String(remaining),
                  )
                : t("integrationsPage.usageExhausted")}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
