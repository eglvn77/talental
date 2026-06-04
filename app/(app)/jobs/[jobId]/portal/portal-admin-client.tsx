"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type {
  JobClientPortalSettingsRow,
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
  updateJobPortalSettingsAction,
} from "@/app/(app)/_actions/portal-tokens";

type SettingsKey =
  | "show_email"
  | "show_phone"
  | "show_linkedin_url"
  | "show_salary_expectations"
  | "show_attachments"
  | "allow_view_notes"
  | "allow_feedback";

const TOGGLES: ReadonlyArray<{ key: SettingsKey; labelKey: string; descKey: string }> = [
  { key: "show_linkedin_url", labelKey: "portal.tg.linkedin", descKey: "portal.tg.linkedinDesc" },
  { key: "show_salary_expectations", labelKey: "portal.tg.salary", descKey: "portal.tg.salaryDesc" },
  { key: "show_attachments", labelKey: "portal.tg.cv", descKey: "portal.tg.cvDesc" },
  { key: "show_email", labelKey: "portal.tg.email", descKey: "portal.tg.emailDesc" },
  { key: "show_phone", labelKey: "portal.tg.phone", descKey: "portal.tg.phoneDesc" },
  { key: "allow_view_notes", labelKey: "portal.tg.notes", descKey: "portal.tg.notesDesc" },
  { key: "allow_feedback", labelKey: "portal.tg.feedback", descKey: "portal.tg.feedbackDesc" },
];

export function JobPortalAdminClient({
  jobId,
  siteUrl,
  tokens,
  sessionsByToken,
  allowedByToken,
  settings,
}: {
  jobId: string;
  siteUrl: string;
  tokens: PortalTokenRow[];
  sessionsByToken: Record<string, PortalSessionRow[]>;
  allowedByToken: Record<string, PortalAllowedEmailRow[]>;
  settings: JobClientPortalSettingsRow | null;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  const activeToken = tokens.find((tk) => tk.is_active) ?? null;
  const revokedTokens = tokens.filter((tk) => !tk.is_active);

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
      const res = await createPortalTokenAction({ scope: "job", jobId });
      if (!res.ok) {
        toast.actionFailed(t("portal.createFailed"), res.error);
        return;
      }
      toast.actionOk(t("portal.linkCreated"));
      router.refresh();
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
      router.refresh();
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
      router.refresh();
    });
  }

  function setToggle(key: SettingsKey, value: boolean) {
    startTransition(async () => {
      const res = await updateJobPortalSettingsAction({
        jobId,
        patch: { [key]: value } as Partial<Record<SettingsKey, boolean>>,
      });
      if (!res.ok) {
        toast.actionFailed(t("portal.settingsFailed"), res.error);
        return;
      }
      router.refresh();
    });
  }

  function currentValue(key: SettingsKey): boolean {
    if (!settings) {
      return (
        key === "show_linkedin_url" ||
        key === "show_salary_expectations" ||
        key === "show_attachments" ||
        key === "allow_feedback"
      );
    }
    return Boolean((settings as Record<string, unknown>)[key]);
  }

  return (
    <div className="mt-6 space-y-8">
      {/* The single shareable link */}
      <section>
        <h2 className="text-sm font-semibold">{t("portal.linkTitle")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("portal.linkHint")}
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
                aria-label={t("portal.copy")}
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
                aria-label={t("portal.regenerate")}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => revoke(activeToken.id)}
                disabled={pending}
                title={t("portal.revoke")}
                className="rounded p-1.5 text-danger hover:bg-danger/10"
                aria-label={t("portal.revoke")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <AllowedEmailsEditor
              token={activeToken}
              emails={allowedByToken[activeToken.id] ?? []}
              pending={pending}
              onRefresh={() => router.refresh()}
            />

            {(sessionsByToken[activeToken.id] ?? []).length > 0 ? (
              <div className="mt-3 border-t border-border pt-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("portal.recentViewers")}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {(sessionsByToken[activeToken.id] ?? []).slice(0, 8).map((s) => (
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

        {revokedTokens.length > 0 ? (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {t("portal.revokedHistory", { n: revokedTokens.length })}
            </summary>
            <ul className="mt-2 space-y-1">
              {revokedTokens.map((tok) => (
                <li
                  key={tok.id}
                  className="flex items-center gap-2 text-[11px] text-muted-foreground"
                >
                  <span className="rounded bg-danger/10 px-1.5 py-0.5 text-danger">
                    {t("portal.revoked")}
                  </span>
                  <code className="truncate">{linkFor(tok.slug)}</code>
                  <span className="ml-auto">
                    {tok.revoked_at
                      ? new Date(tok.revoked_at).toLocaleDateString()
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {/* Visibility toggles */}
      <section>
        <h2 className="text-sm font-semibold">{t("portal.visibilityTitle")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("portal.visibilityHint")}
        </p>
        <div className="mt-3 divide-y divide-border rounded-md border border-border bg-bg-2">
          {TOGGLES.map((tg) => {
            const val = currentValue(tg.key);
            return (
              <label
                key={tg.key}
                className="flex cursor-pointer items-start gap-3 px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={val}
                  disabled={pending}
                  onChange={(e) => setToggle(tg.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {t(tg.labelKey)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(tg.descKey)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("portal.stageHint")}
        </p>
      </section>
    </div>
  );
}

function AllowedEmailsEditor({
  token,
  emails,
  pending,
  onRefresh,
}: {
  token: PortalTokenRow;
  emails: PortalAllowedEmailRow[];
  pending: boolean;
  onRefresh: () => void;
}) {
  const t = useT();
  const [input, setInput] = useState("");
  const [busy, startBusy] = useTransition();

  function add() {
    const email = input.trim();
    if (!email) return;
    startBusy(async () => {
      const res = await addPortalAllowedEmailAction({
        tokenId: token.id,
        email,
      });
      if (!res.ok) {
        toast.actionFailed(t("portal.emailAddFailed"), res.error);
        return;
      }
      setInput("");
      onRefresh();
    });
  }
  function remove(id: string) {
    startBusy(async () => {
      const res = await removePortalAllowedEmailAction({ allowedEmailId: id });
      if (!res.ok) {
        toast.actionFailed(t("portal.emailRemoveFailed"), res.error);
        return;
      }
      onRefresh();
    });
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-medium">{t("portal.allowedEmailsTitle")}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {emails.length === 0
          ? t("portal.allowedEmailsOpen")
          : t("portal.allowedEmailsGated")}
      </p>

      <div className="mt-2 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          type="email"
          placeholder="cliente@empresa.com"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          disabled={pending || busy}
        />
        <Button
          onClick={add}
          disabled={pending || busy || !input.trim()}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("portal.addEmail")}
        </Button>
      </div>

      {emails.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {emails.map((e) => (
            <li
              key={e.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-3 px-2 py-0.5 text-[11px]"
            >
              <span>{e.email}</span>
              <button
                type="button"
                onClick={() => remove(e.id)}
                disabled={pending || busy}
                aria-label={t("portal.removeEmail")}
                title={t("portal.removeEmail")}
                className="rounded-full p-0.5 hover:bg-danger/15 hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
