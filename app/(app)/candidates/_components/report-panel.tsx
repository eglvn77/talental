"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  FileText,
  Pencil,
  RotateCcw,
  ArrowUpRight,
  Share2,
  Check,
  Trash2,
  Save,
} from "lucide-react";
import { getOrCreateApplicationShareTokenAction } from "@/app/(app)/_actions/portal-tokens";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  generateCandidateReportAction,
  acceptManualEditAction,
  deleteCandidateReportAction,
} from "@/app/(app)/_actions/candidate-report";
import { markdownToHtml, isProbablyHtml } from "@/lib/candidate-report/markdown-to-html";
import { RichTextEditor } from "@/app/(app)/_components/rich-text-editor";
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [mode, setMode] = useState<"view" | "edit">("view");
  // Normalize legacy markdown rows to HTML on load so the Tiptap
  // editor accepts them. Newly-generated reports are already HTML.
  const initialHtml = useMemo(() => {
    const raw = report.candidate_report ?? "";
    return isProbablyHtml(raw) ? raw : markdownToHtml(raw);
  }, [report.candidate_report]);
  const [draft, setDraft] = useState(initialHtml);
  const [savedAt, setSavedAt] = useState<string | null>(report.report_edited_at);

  const hasReport = Boolean(report.candidate_report);
  const wasEdited = Boolean(report.report_edited_at);

  // Public share — get-or-create the application share token, copy
  // the URL to clipboard. The action returns the same slug if one
  // already exists for this application so multiple clicks don't
  // accumulate dead tokens.
  const [sharePending, startShare] = useTransition();
  const [shareCopied, setShareCopied] = useState(false);
  function copyShareLink() {
    startShare(async () => {
      const res = await getOrCreateApplicationShareTokenAction({
        applicationId,
      });
      if (!res.ok) {
        toast.actionFailed("Couldn't generate link", res.error);
        return;
      }
      const url = `${window.location.origin}/portal/${res.data.slug}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
        toast.actionOk("Link copied to clipboard");
      } catch {
        // Clipboard API rejected (insecure context?). Show URL in toast.
        toast.actionOk(url);
      }
    });
  }

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

  async function commitEdit(nextHtml?: string) {
    const next = (nextHtml ?? draft).trim();
    if (next === initialHtml.trim()) return;
    const res = await acceptManualEditAction({
      applicationId,
      markdown: next, // arg name kept for API stability; carries HTML now
    });
    if (!res.ok) {
      toast.actionFailed(t("candidatesArea.reportSaveFailed"), res.error);
      return;
    }
    setSavedAt(res.data.edited_at);
    router.refresh();
  }

  /**
   * Explicit Save: commits the current draft AND switches back to
   * view mode. The previous flow only saved on view-toggle, which
   * left users guessing. The button is rendered next to "Preview"
   * while in edit mode.
   */
  function saveNow() {
    startSave(async () => {
      await commitEdit();
      toast.actionOk("Report saved");
      setMode("view");
    });
  }

  /**
   * Delete the report (server zeroes out candidate_report +
   * report_generated_at + report_model + etc). Confirmation dialog
   * gates the call because reports take Claude tokens to regen
   * and the recruiter might have hand-edited it.
   */
  function deleteNow() {
    setConfirmDelete(false);
    startDelete(async () => {
      const res = await deleteCandidateReportAction({ applicationId });
      if (!res.ok) {
        toast.actionFailed("Couldn't delete report", res.error);
        return;
      }
      toast.actionOk("Report deleted");
      setMode("view");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-4 rounded-md border border-border bg-surface-sunken p-3">
      {/* Transcripts → moved to the top-level Conversations tab.
          Keep a compact pointer here so the per-application context
          isn't lost; the count tells the recruiter at a glance
          whether the report has source material. */}
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span className="font-medium uppercase tracking-wider">
            {t("candidatesArea.transcriptsHeading")}
          </span>
          <span>· {transcripts.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyShareLink}
            disabled={sharePending}
            title="Copy public link for this candidate &  vacancy"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {sharePending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : shareCopied ? (
              <Check className="h-3 w-3 text-positive" />
            ) : (
              <Share2 className="h-3 w-3" />
            )}
            {shareCopied ? "Copied" : "Share link"}
          </button>
          <button
            type="button"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("tab", "conversations");
              window.history.pushState({}, "", url.toString());
              router.refresh();
            }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
          >
            Open in Conversations
            <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Report card */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            {t("candidatesArea.reportHeading")}
          </div>
          <div className="flex items-center gap-1">
            {hasReport && mode === "edit" ? (
              <>
                {/* Save commits + flips back to view. */}
                <button
                  type="button"
                  onClick={saveNow}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded bg-foreground px-2 py-1 text-[11px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  {t("candidatesArea.reportSave") ?? "Save"}
                </button>
                {/* Cancel returns to view without persisting; we
                    reset draft so toggling Edit again starts from
                    the stored value. */}
                <button
                  type="button"
                  onClick={() => {
                    setDraft(initialHtml);
                    setMode("view");
                  }}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </>
            ) : null}
            {hasReport && mode === "view" ? (
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                {t("candidatesArea.reportEdit")}
              </button>
            ) : null}
            {hasReport ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                title="Delete report"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Delete
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
          // Read-only preview. The HTML is controlled (AI output that
          // we converted from markdown) — no user-pasted HTML reaches
          // this surface, so dangerouslySetInnerHTML is safe.
          <div
            className="prose prose-sm max-w-none rounded border border-border bg-background p-3 text-sm"
            dangerouslySetInnerHTML={{ __html: initialHtml }}
          />
        ) : (
          // Same Tiptap editor used for job descriptions, so the
          // formatting toolbar + output shape are consistent across
          // the app. onChange autosaves on blur via commitEdit.
          <RichTextEditor
            value={draft}
            onChange={(html) => setDraft(html)}
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
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
        title="¿Eliminar reporte?"
        description="Se borrará el reporte de este candidato para esta vacante. La acción no se puede deshacer; puedes regenerarlo después si lo necesitas."
        confirmLabel="Eliminar"
        destructive
        onConfirm={deleteNow}
      />
    </div>
  );
}
