"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type {
  PortalAllowedEmailRow,
  PortalSessionRow,
  PortalTokenRow,
} from "@/lib/hiring";
import {
  addPortalAllowedEmailAction,
  createPortalTokenAction,
  regeneratePortalTokenAction,
  removePortalAllowedEmailAction,
  revokePortalTokenAction,
} from "@/app/(app)/_actions/portal-tokens";
import { listCompanyPortalTokensAction } from "@/app/(app)/_actions/portal-list";

export function CompanyPortalTab({ companyId }: { companyId: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [siteUrl, setSiteUrl] = useState("");
  const [tokens, setTokens] = useState<PortalTokenRow[]>([]);
  const [sessionsByToken, setSessionsByToken] = useState<
    Record<string, PortalSessionRow[]>
  >({});
  const [allowedByToken, setAllowedByToken] = useState<
    Record<string, PortalAllowedEmailRow[]>
  >({});
  const [copied, setCopied] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");

  async function reload() {
    const res = await listCompanyPortalTokensAction({ companyId });
    if (!res.ok) {
      toast.actionFailed(t("portal.listFailed"), res.error);
      return;
    }
    setSiteUrl(res.data.siteUrl);
    setTokens(res.data.tokens);
    setSessionsByToken(res.data.sessionsByToken);
    setAllowedByToken(res.data.allowedByToken);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await listCompanyPortalTokensAction({ companyId });
      if (!alive) return;
      if (res.ok) {
        setSiteUrl(res.data.siteUrl);
        setTokens(res.data.tokens);
        setSessionsByToken(res.data.sessionsByToken);
        setAllowedByToken(res.data.allowedByToken);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [companyId]);

  const activeToken = tokens.find((tk) => tk.is_active) ?? null;

  function linkFor(slug: string) {
    return `${siteUrl}/portal/${slug}`;
  }
  function copy(slug: string) {
    void navigator.clipboard.writeText(linkFor(slug));
    setCopied(slug);
    toast.actionOk(t("portal.linkCopied"));
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
  }

  function ensureLink() {
    startTransition(async () => {
      const res = await createPortalTokenAction({ scope: "company", companyId });
      if (!res.ok) {
        toast.actionFailed(t("portal.createFailed"), res.error);
        return;
      }
      toast.actionOk(t("portal.linkCreated"));
      await reload();
    });
  }
  function revoke(tokenId: string) {
    if (!confirm(t("portal.revokeConfirm"))) return;
    startTransition(async () => {
      const res = await revokePortalTokenAction({ tokenId });
      if (!res.ok) {
        toast.actionFailed(t("portal.revokeFailed"), res.error);
        return;
      }
      toast.actionOk(t("portal.linkRevoked"));
      await reload();
    });
  }
  function regen(tokenId: string) {
    if (!confirm(t("portal.regenConfirm"))) return;
    startTransition(async () => {
      const res = await regeneratePortalTokenAction({ tokenId });
      if (!res.ok) {
        toast.actionFailed(t("portal.regenFailed"), res.error);
        return;
      }
      toast.actionOk(t("portal.linkRegenerated"));
      await reload();
    });
  }
  function addEmail() {
    const email = emailInput.trim();
    if (!activeToken || !email) return;
    startTransition(async () => {
      const res = await addPortalAllowedEmailAction({
        tokenId: activeToken.id,
        email,
      });
      if (!res.ok) {
        toast.actionFailed(t("portal.emailAddFailed"), res.error);
        return;
      }
      setEmailInput("");
      await reload();
    });
  }
  function removeEmail(id: string) {
    startTransition(async () => {
      const res = await removePortalAllowedEmailAction({ allowedEmailId: id });
      if (!res.ok) {
        toast.actionFailed(t("portal.emailRemoveFailed"), res.error);
        return;
      }
      await reload();
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allowed = activeToken ? allowedByToken[activeToken.id] ?? [] : [];
  const sessions = activeToken ? sessionsByToken[activeToken.id] ?? [] : [];

  return (
    <section>
      <h3 className="text-sm font-semibold">{t("portal.linkTitle")}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("portal.companyLinksHint")}
      </p>

      {!activeToken ? (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-dashed border-foreground/20 bg-foreground/[0.02] p-4">
          <p className="flex-1 text-xs text-muted-foreground">
            {t("portal.noLinkYet")}
          </p>
          <Button onClick={ensureLink} disabled={pending} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("portal.createLink")}
          </Button>
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-border bg-bg-2 p-3">
          <div className="flex items-center gap-1.5">
            <code className="flex-1 truncate rounded bg-foreground/5 px-2 py-1.5 text-xs">
              {linkFor(activeToken.slug)}
            </code>
            <button
              type="button"
              onClick={() => copy(activeToken.slug)}
              title={t("portal.copy")}
              className="rounded p-1.5 hover:bg-muted"
            >
              {copied === activeToken.slug ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => regen(activeToken.id)}
              disabled={pending}
              title={t("portal.regenerate")}
              className="rounded p-1.5 hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => revoke(activeToken.id)}
              disabled={pending}
              title={t("portal.revoke")}
              className="rounded p-1.5 text-danger hover:bg-danger/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs font-medium">{t("portal.allowedEmailsTitle")}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {allowed.length === 0
                ? t("portal.allowedEmailsOpen")
                : t("portal.allowedEmailsGated")}
            </p>
            <div className="mt-2 flex gap-2">
              <Input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                type="email"
                placeholder="cliente@empresa.com"
                disabled={pending}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
              />
              <Button
                onClick={addEmail}
                disabled={pending || !emailInput.trim()}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("portal.addEmail")}
              </Button>
            </div>
            {allowed.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {allowed.map((e) => (
                  <li
                    key={e.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-3 px-2 py-0.5 text-[11px]"
                  >
                    <span>{e.email}</span>
                    <button
                      type="button"
                      onClick={() => removeEmail(e.id)}
                      disabled={pending}
                      aria-label={t("portal.removeEmail")}
                      className="rounded-full p-0.5 hover:bg-danger/15 hover:text-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {sessions.length > 0 ? (
            <div className="mt-3 border-t border-border pt-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("portal.recentViewers")}
              </p>
              <ul className="mt-1 space-y-0.5">
                {sessions.slice(0, 8).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span>{s.email}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(s.last_seen_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        {t("portal.companyLinksFooter")}
      </p>
    </section>
  );
}
