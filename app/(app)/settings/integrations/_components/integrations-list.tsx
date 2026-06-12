"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Linkedin,
  Mail,
  MessageCircle,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plug,
  Unplug,
  RefreshCw,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  connectChannelAction,
  disconnectChannelAction,
  syncChannelsAction,
} from "@/app/(app)/_actions/integrations";

export type ConnectedAccountItem = {
  id: string;
  provider: string;
  status: string;
  label: string | null;
  lastUpdate: string | null;
};

type Channel = {
  key: "linkedin" | "gmail" | "whatsapp";
  name: string;
  Icon: typeof Linkedin;
  /** connected_accounts.provider values that count as this channel. */
  providers: string[];
};

const CHANNELS: Channel[] = [
  { key: "linkedin", name: "LinkedIn", Icon: Linkedin, providers: ["LINKEDIN"] },
  { key: "gmail", name: "Gmail", Icon: Mail, providers: ["GOOGLE", "GOOGLE_OAUTH"] },
  { key: "whatsapp", name: "WhatsApp", Icon: MessageCircle, providers: ["WHATSAPP"] },
];

export function IntegrationsList({
  accounts,
}: {
  accounts: ConnectedAccountItem[];
}) {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const [syncing, startSync] = useTransition();

  function sync(announce: boolean) {
    startSync(async () => {
      const res = await syncChannelsAction();
      if (!res.ok) {
        if (announce) toast.actionFailed(t("integrations.syncFailed"), res.error);
        return;
      }
      if (announce) toast.actionOk(t("integrations.synced"));
      router.refresh();
    });
  }

  // On return from the Hosted-Auth wizard, pull accounts from Unipile
  // (the notify webhook is unreliable) so the just-connected channel
  // shows up without the admin having to do anything.
  useEffect(() => {
    if (sp.get("connected")) {
      sync(false);
      toast.actionOk(t("integrations.connected"));
      router.replace("/settings/integrations");
    } else if (sp.get("error")) {
      toast.actionFailed(t("integrations.connectFailed"), sp.get("error") ?? "");
      router.replace("/settings/integrations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => sync(true)}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t("integrations.sync")}
        </button>
      </div>
      <ul className="space-y-2">
        {CHANNELS.map((ch) => {
          const account =
            accounts.find((a) => ch.providers.includes(a.provider)) ?? null;
          return <ChannelRow key={ch.key} channel={ch} account={account} />;
        })}
      </ul>
    </div>
  );
}

function ChannelRow({
  channel,
  account,
}: {
  channel: Channel;
  account: ConnectedAccountItem | null;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { Icon } = channel;
  const ok = account?.status === "OK";
  const needsReconnect =
    account != null && account.status !== "OK" && account.status !== "PENDING";

  function connect() {
    start(async () => {
      const res = await connectChannelAction({
        channel: channel.key,
        reconnectAccountId: undefined,
      });
      if (!res.ok) {
        toast.actionFailed(t("integrations.connectFailed"), res.error);
        return;
      }
      // Top-level navigation into Unipile's hosted wizard.
      window.location.href = res.data.url;
    });
  }

  function disconnect() {
    if (!account) return;
    start(async () => {
      const res = await disconnectChannelAction({ accountRowId: account.id });
      if (!res.ok) {
        toast.actionFailed(t("integrations.disconnectFailed"), res.error);
        return;
      }
      toast.actionOk(t("integrations.disconnected"));
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4.5 w-4.5 text-foreground" />
      </span>
      <div className="min-w-[8rem] flex-1">
        <p className="text-sm font-medium">{channel.name}</p>
        {account ? (
          <p className="truncate text-xs text-muted-foreground">
            {account.label ?? t("integrations.connectedAccount")}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("integrations.notConnected")}
          </p>
        )}
      </div>

      {/* Status badge */}
      {ok ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
          <CheckCircle2 className="h-3 w-3" />
          {t("integrations.statusOk")}
        </span>
      ) : needsReconnect ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
          <AlertTriangle className="h-3 w-3" />
          {t("integrations.statusReconnect")}
        </span>
      ) : null}

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={connect}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="h-3.5 w-3.5" />
          )}
          {account
            ? t("integrations.reconnect")
            : t("integrations.connect")}
        </button>
        {account ? (
          <button
            type="button"
            onClick={disconnect}
            disabled={pending}
            title={t("integrations.disconnect")}
            aria-label={t("integrations.disconnect")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            <Unplug className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </li>
  );
}
