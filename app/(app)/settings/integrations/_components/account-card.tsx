"use client";

import { useState, useTransition } from "react";
import {
  Linkedin,
  Mail,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Unplug,
  Link2,
  Crown,
  Loader2,
} from "lucide-react";
import {
  syncConnectedAccountsAction,
  disconnectAccountAction,
} from "../_actions";
import { toast } from "@/lib/toast";

type Account = {
  id: string;
  provider: string;
  status: string;
  last_status_update: string;
  account_metadata: Record<string, unknown> | null;
};

/**
 * One row per connected channel account. Matches the Pin/Unipile
 * dashboard pattern: provider icon → name → status badges → ⋮ menu.
 *
 * Dropdown actions:
 *   - Refresh Status (re-sync from Unipile)
 *   - Reconnect (mints a new hosted-auth link — handled by parent's
 *     ConnectLinkedinButton; this card only handles the in-place
 *     actions)
 *   - Disconnect (DELETE from connected_accounts; Unipile retains
 *     the link so reconnect is fast)
 */
export function AccountCard({ account }: { account: Account }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, startTransition] = useTransition();

  const meta = (account.account_metadata ?? {}) as Record<string, unknown>;
  const display = pickDisplayName(account.provider, meta);
  const isSalesNav = detectSalesNav(meta);
  const isConnected = account.status === "ok";

  function refresh() {
    setMenuOpen(false);
    startTransition(async () => {
      const res = await syncConnectedAccountsAction();
      if (!res.ok) {
        toast.actionFailed("Couldn't refresh", res.error);
        return;
      }
      toast.actionOk("Status refreshed");
    });
  }

  function disconnect() {
    if (!window.confirm(`Disconnect ${display}?`)) return;
    setMenuOpen(false);
    startTransition(async () => {
      const res = await disconnectAccountAction(account.id);
      if (!res.ok) {
        toast.actionFailed("Couldn't disconnect", res.error);
        return;
      }
      toast.actionOk("Disconnected");
    });
  }

  const Icon = providerIcon(account.provider);

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-4 w-4 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{display}</span>
          <span
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              isConnected
                ? "bg-positive/15 text-positive"
                : "bg-warning/15 text-warning"
            }`}
          >
            {isConnected ? "Connected" : account.status}
          </span>
          {isSalesNav ? (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
              <Crown className="h-2.5 w-2.5" />
              Sales Navigator
            </span>
          ) : null}
        </div>
        {pickSubline(account.provider, meta) ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {pickSubline(account.provider, meta)}
          </p>
        ) : null}
      </div>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          disabled={busy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label="Account actions"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-md border border-border bg-background py-1 shadow-dropdown">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={refresh}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh status
            </button>
            <a
              href={`/api/integrations/unipile/connect`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                // Reconnect: same provider, with reconnectAccountId.
                void fetch("/api/integrations/unipile/connect", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    providers: [account.provider],
                    reconnectAccountId: account.id,
                  }),
                })
                  .then((r) => r.json())
                  .then((j) => {
                    if (j.ok && j.url) {
                      window.open(j.url, "_blank", "noopener,noreferrer");
                      setMenuOpen(false);
                    } else {
                      toast.actionFailed("Couldn't reconnect", j.error);
                    }
                  });
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <Link2 className="h-3 w-3" />
              Reconnect
            </a>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={disconnect}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-danger hover:bg-danger/10"
            >
              <Unplug className="h-3 w-3" />
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────

function providerIcon(provider: string) {
  if (provider === "LINKEDIN") return Linkedin;
  if (provider === "WHATSAPP") return MessageSquare;
  return Mail;
}

/**
 * Pull the best human-readable name for the account based on the
 * Unipile metadata blob. Falls back to the provider name when no
 * identity is available yet.
 */
function pickDisplayName(
  provider: string,
  meta: Record<string, unknown>,
): string {
  const profile = (meta.profile ?? null) as Record<string, unknown> | null;
  if (profile) {
    const first = (profile.first_name as string) || "";
    const last = (profile.last_name as string) || "";
    const composed = [first, last].filter(Boolean).join(" ").trim();
    if (composed) return composed;
  }
  if (typeof meta.email === "string") return meta.email;
  if (typeof meta.phone === "string") return meta.phone;
  if (provider === "LINKEDIN") return "LinkedIn";
  if (provider === "WHATSAPP") return "WhatsApp";
  if (provider === "GOOGLE") return "Gmail";
  if (provider === "OUTLOOK") return "Outlook";
  return provider;
}

function pickSubline(
  provider: string,
  meta: Record<string, unknown>,
): string | null {
  // Email/phone shown under the name when there's a richer display
  // name (e.g. "Emanuel Galván" + "emanuel@talental.mx").
  const profile = (meta.profile ?? null) as Record<string, unknown> | null;
  const hasFullName = !!(
    profile &&
    ((profile.first_name as string) || (profile.last_name as string))
  );
  if (hasFullName) {
    if (typeof meta.email === "string") return meta.email;
    if (typeof meta.phone === "string") return meta.phone;
  }
  if (provider === "LINKEDIN" && typeof meta.public_id === "string") {
    return `linkedin.com/in/${meta.public_id}`;
  }
  return null;
}

/**
 * Best-effort Sales Navigator detection. Unipile flags it in
 * connection_params or in a `premium`/`sales_navigator` field
 * inside the profile object. Treat as on if ANY signal is true.
 */
function detectSalesNav(meta: Record<string, unknown>): boolean {
  const profile = (meta.profile ?? null) as Record<string, unknown> | null;
  if (profile?.is_sales_navigator === true) return true;
  if (profile?.sales_navigator === true) return true;
  const params = (meta.connection_params ?? null) as Record<string, unknown> | null;
  if (params?.sales_navigator === true) return true;
  return false;
}
