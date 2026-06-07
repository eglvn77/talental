"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  FileText,
  Calendar,
  Pencil,
  Eye,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  generateCandidateReportAction,
  acceptManualEditAction,
} from "@/app/(app)/_actions/candidate-report";
import type { TranscriptListItem } from "../candidate-profile-body";

/**
 * Per-application expandable panel — shows the linked Granola/manual
 * transcripts and the AI-generated candidate report for this exact
 * application. Mounted inline inside each ApplicationRow when the
 * recruiter expands it.
 *
 * Responsibilities:
 * - List transcripts attached to the application (title + source +
 *   recorded date). Source badge differentiates granola from manual.
 * - "Generate report" → calls server action. Refused upstream if the
 *   candidate has zero info (no transcripts, no CV, no enrichment).
 * - View / Edit toggle for the markdown report. Editing saves on
 *   blur and stamps report_edited_at.
 * - Re-generate confirms when there are unsaved manual edits (to
 *   avoid silent overwrite).
 */

type Report = {
  candidate_report: string | null;
  report_generated_at: string | null;
  report_model: string | null;
  report_edited_at: string | null;
  report_inputs: unknown;
};

export function ReportPanel({
  applicationId,
  transcripts,
  report,
}: {
  applicationId: string;
  transcripts: TranscriptListItem[];
  report: Report;
}) {
  const t = useT();
  const router = useRouter();
  const [generating, startGen] = useTransition();
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  // Local copy so the textarea keeps up while autosaving.
  const [draft, setDraft] = useState(report.candidate_report ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(report.report_edited_at);

  const hasReport = Boolean(report.candidate_report);
  const wasEdited = Boolean(report.report_edited_at);

  function runGenerate() {
    setConfirmRegen(false);
    startGen(async () => {
      const res = await generateCandidateReportAction({ applicationId });
      if (!res.ok) {
        toast.actionFailed(t("candidatesArea.reportGenerateFailed"), res.error);
        return;
      }
      toast.actionOk(
        t("candidatesArea.reportGenerated", {
          rating: res.data.rating ?? "—",
        }),
      );
      router.refresh();
    });
  }

  function handleGenerateClick() {
    if (hasReport && wasEdited) {
      setConfirmRegen(true);
      return;
    }
    runGenerate();
  }

  async function commitEdit() {
    const next = draft.trim();
    if (next === (report.candidate_report ?? "").trim()) return;
    const res = await acceptManualEditAction({
      applicationId,
      markdown: next,
    });
    if (!res.ok) {
      toast.actionFailed(t("candidatesArea.reportSaveFailed"), res.error);
      return;
    }
    setSavedAt(res.data.edited_at);
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-4 rounded-md border border-border bg-surface-sunken p-3">
      {/* Transcripts list */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3 w-3" />
          {t("candidatesArea.transcriptsHeading")}
          <span className="font-normal normal-case text-muted-foreground/70">
            ({transcripts.length})
          </span>
        </div>
        {transcripts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("candidatesArea.transcriptsEmpty")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {transcripts.map((tr) => (
              <li
                key={tr.id}
                className="flex items-center gap-2 text-xs text-foreground/80"
              >
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                    tr.source === "granola"
                      ? "bg-accent/10 text-accent"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {tr.source}
                </span>
                <span className="flex-1 truncate">
                  {tr.title ?? t("candidatesArea.transcriptUntitled")}
                </span>
                {tr.recorded_at ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(tr.recorded_at).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Report card */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            {t("candidatesArea.reportHeading")}
          </div>
          <div className="flex items-center gap-1">
            {hasReport ? (
              <button
                type="button"
                onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {mode === "view" ? (
                  <>
                    <Pencil className="h-3 w-3" />
                    {t("candidatesArea.reportEdit")}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    {t("candidatesArea.reportPreview")}
                  </>
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-fg-on-accent transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : hasReport ? (
                <RotateCcw className="h-3 w-3" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {hasReport
                ? t("candidatesArea.reportRegenerate")
                : t("candidatesArea.reportGenerate")}
            </button>
          </div>
        </div>

        {!hasReport ? (
          <p className="text-xs text-muted-foreground">
            {transcripts.length === 0
              ? t("candidatesArea.reportEmptyNoTranscripts")
              : t("candidatesArea.reportEmpty")}
          </p>
        ) : mode === "view" ? (
          <div
            className="prose prose-sm max-w-none rounded border border-border bg-background p-3 text-sm"
            // Renderer min for the markdown subset the prompt emits:
            // ## h2, ### h3, **bold**, *italic*, * / - bullets,
            // blank-line paragraphs. ⭐ chars pass through verbatim.
            // HTML is escaped before formatting, so the report's
            // controlled output can't inject scripts.
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(report.candidate_report ?? ""),
            }}
          />
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            rows={Math.min(20, Math.max(8, draft.split("\n").length + 2))}
            className="w-full rounded border border-border bg-background p-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent"
          />
        )}

        {hasReport ? (
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {report.report_generated_at ? (
              <>
                {t("candidatesArea.reportGeneratedAt", {
                  when: new Date(report.report_generated_at).toLocaleString(
                    "es-MX",
                  ),
                  model: report.report_model ?? "—",
                })}
              </>
            ) : null}
            {savedAt ? (
              <>
                {" · "}
                {t("candidatesArea.reportEditedAt", {
                  when: new Date(savedAt).toLocaleString("es-MX"),
                })}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={(o) => !o && setConfirmRegen(false)}
        title={t("candidatesArea.reportRegenerateTitle")}
        description={t("candidatesArea.reportRegenerateDesc")}
        confirmLabel={t("candidatesArea.reportRegenerate")}
        destructive
        onConfirm={runGenerate}
      />
    </div>
  );
}

/**
 * Minimal markdown → HTML for the candidate-report subset:
 *   ## heading 2          → <h2>…</h2>
 *   ### heading 3         → <h3>…</h3>
 *   * bullet  (or `- `)   → <li>…</li> grouped under <ul>
 *   **bold**              → <strong>…</strong>
 *   *italic*              → <em>…</em>
 *   blank line            → paragraph break
 *
 * HTML is escaped before formatting, so even if the AI ever leaked
 * raw HTML it would render as text. The report content comes from
 * our own prompt + model so XSS surface is effectively nil.
 */
function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let list: string[] | null = null;
  let para: string[] | null = null;

  const flushList = () => {
    if (list) {
      out.push(
        `<ul class="list-disc pl-5 space-y-1 my-2">${list
          .map((li) => `<li>${inlineFormat(li)}</li>`)
          .join("")}</ul>`,
      );
      list = null;
    }
  };
  const flushPara = () => {
    if (para && para.length > 0) {
      out.push(
        `<p class="my-2">${para.map(inlineFormat).join("<br/>")}</p>`,
      );
      para = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("### ")) {
      flushList();
      flushPara();
      out.push(
        `<h3 class="font-semibold text-sm mt-3 mb-1">${inlineFormat(line.slice(4))}</h3>`,
      );
    } else if (line.startsWith("## ")) {
      flushList();
      flushPara();
      out.push(
        `<h2 class="font-semibold text-base mt-3 mb-2">${inlineFormat(line.slice(3))}</h2>`,
      );
    } else if (/^\s*[*-]\s+/.test(line)) {
      flushPara();
      (list ??= []).push(line.replace(/^\s*[*-]\s+/, ""));
    } else if (line.trim() === "") {
      flushList();
      flushPara();
    } else {
      flushList();
      (para ??= []).push(line);
    }
  }
  flushList();
  flushPara();
  return out.join("");
}

function inlineFormat(text: string): string {
  // 1. Escape HTML first (no `replace`-of-replace bugs because we go
  //    char-by-char effectively via 3 sequential global replaces).
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // 2. **bold** — must run BEFORE *italic* so the bold pattern eats
  //    its own asterisks. Non-greedy.
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // 3. *italic* — match singles that aren't part of a remaining **.
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return html;
}
