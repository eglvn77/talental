"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { SourceRow } from "@/lib/hiring";
import {
  createJobTrackingLinkAction,
  deleteJobTrackingLinkAction,
} from "./tracking-links-actions";

export type TrackingLinkItem = {
  id: string;
  token: string;
  label: string | null;
  source_id: string | null;
};

/**
 * Per-vacante careers tracking links. Each link is a shareable careers
 * URL carrying a unique ?src=<token> tied to a candidate Source, so an
 * applicant arriving through it is auto-attributed. Create as many as
 * you want (one per channel / campaign).
 */
export function TrackingLinks({
  jobId,
  workspaceSlug,
  jobSlug,
  sources,
  initialLinks,
}: {
  jobId: string;
  workspaceSlug: string;
  jobSlug: string;
  sources: SourceRow[];
  initialLinks: TrackingLinkItem[];
}) {
  const t = useT();
  const [links, setLinks] = useState(initialLinks);
  const [sourceId, setSourceId] = useState("");
  const [label, setLabel] = useState("");
  const [, start] = useTransition();

  const sourceById = new Map(sources.map((s) => [s.id, s]));

  function urlFor(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/careers/${workspaceSlug}/${jobSlug}?src=${token}`;
  }

  function onCreate() {
    start(async () => {
      const res = await createJobTrackingLinkAction({
        jobId,
        sourceId: sourceId || null,
        label: label || null,
      });
      if (!res.ok) {
        toast.actionFailed(t("trackingLinks.createFailed"), res.error);
        return;
      }
      setLinks((cur) => [
        {
          id: res.data.link.id,
          token: res.data.link.token,
          label: res.data.link.label,
          source_id: res.data.link.source_id,
        },
        ...cur,
      ]);
      setLabel("");
      setSourceId("");
    });
  }

  function onDelete(id: string) {
    setLinks((cur) => cur.filter((l) => l.id !== id));
    start(async () => {
      const res = await deleteJobTrackingLinkAction({ id, jobId });
      if (!res.ok) toast.actionFailed(t("trackingLinks.deleteFailed"), res.error);
    });
  }

  return (
    <section className="space-y-3 rounded-md border border-border bg-bg-1 p-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Link2 className="h-3.5 w-3.5" />
          {t("trackingLinks.title")}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("trackingLinks.hint")}
        </p>
      </div>

      {/* Create row */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("trackingLinks.source")}
          </span>
          <Select
            value={sourceId}
            onChange={setSourceId}
            options={[
              { value: "", label: t("trackingLinks.noSource") },
              ...sources.map((s) => ({ value: s.id, label: s.label })),
            ]}
            className="min-w-[160px]"
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("trackingLinks.label")}
          </span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("trackingLinks.labelPlaceholder")}
          />
        </label>
        <Button type="button" size="sm" onClick={onCreate} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          {t("trackingLinks.create")}
        </Button>
      </div>

      {/* Existing links */}
      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("trackingLinks.empty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {links.map((l) => (
            <LinkRow
              key={l.id}
              link={l}
              url={urlFor(l.token)}
              source={l.source_id ? sourceById.get(l.source_id) ?? null : null}
              onDelete={() => onDelete(l.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkRow({
  link,
  url,
  source,
  onDelete,
}: {
  link: TrackingLinkItem;
  url: string;
  source: SourceRow | null;
  onDelete: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm">
      {source ? (
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            background: (source.color ?? "#94a3b8") + "22",
            color: source.color ?? "#475569",
          }}
        >
          {source.label}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {t("trackingLinks.noSource")}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {link.label ? `${link.label} · ` : ""}
        {url}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={t("trackingLinks.copy")}
        title={t("trackingLinks.copy")}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-positive" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t("trackingLinks.delete")}
        title={t("trackingLinks.delete")}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
