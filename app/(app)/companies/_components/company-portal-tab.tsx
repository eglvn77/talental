"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type { PortalSessionRow, PortalTokenRow } from "@/lib/hiring";
import {
  createPortalTokenAction,
  regeneratePortalTokenAction,
  revokePortalTokenAction,
} from "@/app/(app)/_actions/portal-tokens";
import { listCompanyPortalTokensAction } from "@/app/(app)/_actions/portal-list";

/**
 * Portal tab inside the company slideover. Lazy-loads its data on
 * mount so the company bundle (rendered for every open slideover)
 * stays untouched.
 */
export function CompanyPortalTab({ companyId }: { companyId: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [siteUrl, setSiteUrl] = useState("");
  const [tokens, setTokens] = useState<PortalTokenRow[]>([]);
  const [sessionsByToken, setSessionsByToken] = useState<
    Record<string, PortalSessionRow[]>
  >({});
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function reload() {
    const res = await listCompanyPortalTokensAction({ companyId });
    if (!res.ok) {
      toast.actionFailed(t("portal.listFailed"), res.error);
      return;
    }
    setSiteUrl(res.data.siteUrl);
    setTokens(res.data.tokens);
    setSessionsByToken(res.data.sessionsByToken);
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
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [companyId]);

  function linkFor(slug: string) {
    return `${siteUrl}/portal/${slug}`;
  }
  function copy(slug: string) {
    void navigator.clipboard.writeText(linkFor(slug));
    setCopied(slug);
    toast.actionOk(t("portal.linkCopied"));
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
  }

  function create() {
    startTransition(async () => {
      const res = await createPortalTokenAction({
        scope: "company",
        companyId,
        label: label || undefined,
      });
      if (!res.ok) {
        toast.actionFailed(t("portal.createFailed"), res.error);
        return;
      }
      setLabel("");
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

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-semibold">{t("portal.companyLinksTitle")}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("portal.companyLinksHint")}
      </p>

      <div className="mt-3 flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("portal.labelPlaceholder")}
          className="max-w-xs"
        />
        <Button onClick={create} disabled={pending} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("portal.createLink")}
        </Button>
      </div>

      {tokens.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-6 text-center text-xs text-muted-foreground">
          {t("portal.noLinksYet")}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {tokens.map((tok) => {
            const sessions = sessionsByToken[tok.id] ?? [];
            return (
              <li
                key={tok.id}
                className="rounded-md border border-border bg-bg-2 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  {tok.label ? (
                    <span className="text-sm font-medium">{tok.label}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("portal.unlabeled")}
                    </span>
                  )}
                  {!tok.is_active ? (
                    <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                      {t("portal.revoked")}
                    </span>
                  ) : null}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(tok.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <code className="flex-1 truncate rounded bg-foreground/5 px-2 py-1 text-[11px] text-muted-foreground">
                    {linkFor(tok.slug)}
                  </code>
                  {tok.is_active ? (
                    <>
                      <button
                        type="button"
                        onClick={() => copy(tok.slug)}
                        title={t("portal.copy")}
                        className="rounded p-1.5 hover:bg-muted"
                        aria-label={t("portal.copy")}
                      >
                        {copied === tok.slug ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => regen(tok.id)}
                        disabled={pending}
                        title={t("portal.regenerate")}
                        className="rounded p-1.5 hover:bg-muted"
                        aria-label={t("portal.regenerate")}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => revoke(tok.id)}
                        disabled={pending}
                        title={t("portal.revoke")}
                        className="rounded p-1.5 text-danger hover:bg-danger/10"
                        aria-label={t("portal.revoke")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : null}
                </div>
                {sessions.length > 0 ? (
                  <div className="mt-2 border-t border-border/60 pt-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("portal.recentViewers")}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {sessions.slice(0, 5).map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-foreground">{s.email}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(s.last_seen_at).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        {t("portal.companyLinksFooter")}
      </p>
    </section>
  );
}
