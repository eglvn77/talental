"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type { JobClientPortalSettingsRow, PortalSessionRow, PortalTokenRow } from "@/lib/hiring";
import {
  createPortalTokenAction,
  regeneratePortalTokenAction,
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
  settings,
}: {
  jobId: string;
  siteUrl: string;
  tokens: PortalTokenRow[];
  sessionsByToken: Record<string, PortalSessionRow[]>;
  settings: JobClientPortalSettingsRow | null;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

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
        scope: "job",
        jobId,
        label: label || undefined,
      });
      if (!res.ok) {
        toast.actionFailed(t("portal.createFailed"), res.error);
        return;
      }
      setLabel("");
      toast.actionOk(t("portal.linkCreated"));
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
      // Defaults matching the action's insert payload.
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
      {/* Links section */}
      <section>
        <h2 className="text-sm font-semibold">{t("portal.linksTitle")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("portal.linksHint")}
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
