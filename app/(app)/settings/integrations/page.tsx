import { hiring } from "@/lib/hiring";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { Linkedin, Mail, MessageSquare } from "lucide-react";
import { ConnectLinkedinButton } from "./connect-button";
import { DAILY_UNIPILE_LIMIT } from "@/lib/integrations/unipile/profile";
import { SettingsTabsServer } from "../_components/settings-tabs-server";
import { getT } from "@/lib/i18n/server";
import { syncConnectedAccountsAction } from "./_actions";
import { AccountCard } from "./_components/account-card";
import { SyncButton } from "./_components/sync-button";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  provider: string;
  status: string;
  last_status_update: string;
  account_metadata: Record<string, unknown> | null;
};

/**
 * Settings → Integrations.
 *
 * Layout mirrors the Pin / Unipile dashboard pattern: each channel
 * has a section with a header description and either an empty
 * "Connect" CTA or a list of account cards. Each card has an icon
 * + name + status badge(s) + ⋮ dropdown (Refresh / Reconnect /
 * Disconnect).
 *
 * Source of truth: we sync from Unipile every page load via
 * syncConnectedAccountsAction(). The webhook is a nice-to-have but
 * not relied on — solves the "I connected but the badge still says
 * Not connected" race that motivated this refactor.
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

  // Always re-sync from Unipile on EVERY page load — not just after
  // wizard. One /accounts call (~200ms) keeps the panel
  // authoritative regardless of webhook delivery. Result captured
  // so we can show it in a debug banner if the sync failed or
  // matched zero accounts (the user can then click Refresh to
  // retry).
  const syncResult = await syncConnectedAccountsAction().catch((e) => ({
    ok: false as const,
    error: e instanceof Error ? e.message : String(e),
  }));

  const db = await hiring();
  const { data: accounts } = await db
    .from("connected_accounts")
    .select("id, provider, status, last_status_update, account_metadata")
    .eq("workspace_id", me.workspace.id)
    .order("created_at", { ascending: false });
  const rows = (accounts ?? []) as Row[];

  const linkedinAccounts = rows.filter((r) => r.provider === "LINKEDIN");
  const emailAccounts = rows.filter(
    (r) => r.provider === "GOOGLE" || r.provider === "OUTLOOK" || r.provider === "IMAP",
  );
  const whatsappAccounts = rows.filter((r) => r.provider === "WHATSAPP");

  const linkedinConnected = linkedinAccounts.some((a) => a.status === "ok");

  // Daily Unipile usage counter — only meaningful when LinkedIn is
  // connected since that's the channel that consumes the cap today.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: todayUnipileCount } = await db
    .from("candidates")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", me.workspace.id)
    .eq("enrichment_status", "unipile_ok")
    .gte("enriched_at", startOfDay.toISOString());
  const usedToday = todayUnipileCount ?? 0;
  const pctUsed = Math.min(100, (usedToday / DAILY_UNIPILE_LIMIT) * 100);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <SettingsTabsServer />
      <div className="mt-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {t("integrationsPage.title")}
        </h1>
        <SyncButton />
      </div>

      {justConnected ? (
        <div className="mt-4 rounded-md border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-positive">
          {t("integrationsPage.bannerSuccess")}
        </div>
      ) : null}
      {justFailed ? (
        <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {t("integrationsPage.bannerFailure")}
        </div>
      ) : null}

      {/* Diagnostic banner — surfaces the sync result so we can see
          what's happening when accounts aren't appearing. Shows on
          every page load. Hidden once the sync starts returning
          matches consistently (>0 synced). */}
      {!syncResult.ok ? (
        <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-xs font-mono text-danger">
          <strong>Sync error:</strong> {syncResult.error}
        </div>
      ) : syncResult.synced === 0 && rows.length === 0 ? (
        <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          <strong>Sync ran (0 accounts matched).</strong> Unipile no
          devolvió cuentas asociadas a tu auth_user_id. Si ya
          completaste el wizard, lo más probable es que Unipile no
          haya recibido tu user_id como `name`. Vuelve a darle
          "Connect LinkedIn" para reintentar.
        </div>
      ) : null}

      {/* LinkedIn ───────────────────────────────────────────── */}
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <header>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Linkedin className="h-4 w-4" />
            LinkedIn
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integrationsPage.linkedinDesc")}
          </p>
        </header>

        {linkedinAccounts.length > 0 ? (
          <div className="mt-4 space-y-2">
            {linkedinAccounts.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          <ConnectLinkedinButton
            providers={["LINKEDIN"]}
            label={
              linkedinAccounts.length === 0
                ? t("integrationsPage.connect")
                : t("integrationsPage.connectAnother")
            }
          />
        </div>

        {linkedinConnected ? (
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
          </div>
        ) : null}
      </section>

      {/* Email Accounts ──────────────────────────────────────── */}
      <section className="mt-4 rounded-lg border border-border bg-card p-5">
        <header>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Mail className="h-4 w-4" />
            {t("integrationsPage.emailTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integrationsPage.emailDesc")}
          </p>
        </header>

        {emailAccounts.length > 0 ? (
          <div className="mt-4 space-y-2">
            {emailAccounts.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          <ConnectLinkedinButton
            providers={["GOOGLE", "OUTLOOK"]}
            label={t("integrationsPage.connectEmail")}
          />
        </div>
      </section>

      {/* WhatsApp ────────────────────────────────────────────── */}
      <section className="mt-4 rounded-lg border border-border bg-card p-5">
        <header>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <MessageSquare className="h-4 w-4" />
            WhatsApp
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integrationsPage.whatsappDesc")}
          </p>
        </header>

        {whatsappAccounts.length > 0 ? (
          <div className="mt-4 space-y-2">
            {whatsappAccounts.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          <ConnectLinkedinButton
            providers={["WHATSAPP"]}
            label={t("integrationsPage.connectWhatsapp")}
          />
        </div>
      </section>

    </div>
  );
}
