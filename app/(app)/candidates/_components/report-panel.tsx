"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  FileText,
  ClipboardList,
  Pencil,
  RotateCcw,
  ArrowUpRight,
  Trash2,
  Save,
} from "lucide-react";
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

/** What the careers apply route stores on applications.source_meta. */
type ApplySourceMeta = {
  applicant_location?: string | null;
  salary_expectation_amount?: number | null;
  salary_expectation_currency?: string | null;
  screening_answers?: Array<{
    id: string;
    prompt?: string;
    answer?: unknown;
  }> | null;
};

function parseApplyMeta(raw: unknown): ApplySourceMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const m = raw as ApplySourceMeta;
  const answers = Array.isArray(m.screening_answers)
    ? m.screening_answers.filter(
        (a) =>
          a &&
          typeof a.answer === "string" &&
          a.answer.trim() !== "" &&
          typeof a.prompt === "string",
      )
    : [];
  const hasSalary =
    typeof m.salary_expectation_amount === "number" &&
    Number.isFinite(m.salary_expectation_amount);
  const hasLocation =
    typeof m.applicant_location === "string" &&
    m.applicant_location.trim() !== "";
  if (!hasSalary && !hasLocation && answers.length === 0) return null;
  return {
    applicant_location: hasLocation ? m.applicant_location : null,
    salary_expectation_amount: hasSalary
      ? m.salary_expectation_amount
      : null,
    salary_expectation_currency: m.salary_expectation_currency ?? null,
    screening_answers: answers,
  };
}

export function ReportPanel({
  applicationId,
  transcripts,
  report,
  sourceMeta,
}: {
  applicationId: string;
  transcripts: TranscriptListItem[];
  report: Report;
  /** applications.source_meta — careers answers, when present. */
  sourceMeta?: unknown;
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
  const applyMeta = useMemo(() => parseApplyMeta(sourceMeta), [sourceMeta]);

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

      {/* Application answers — what the candidate filled in on the
          careers form (location, salary expectation, screening
          questions). Read-only; the salary also mirrors onto the
          profile's expected-comp field at apply time. */}
      {applyMeta ? (
        <div className="rounded-md border border-border bg-card px-2.5 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <ClipboardList className="h-3 w-3" />
            {t("candidatesArea.appAnswersHeading")}
          </div>
          <dl className="space-y-1.5">
            {applyMeta.applicant_location ? (
              <AnswerRow
                label={t("candidatesArea.appAnswerLocation")}
                value={applyMeta.applicant_location}
              />
            ) : null}
            {applyMeta.salary_expectation_amount != null ? (
              <AnswerRow
                label={t("candidatesArea.compExpected")}
                value={`${applyMeta.salary_expectation_amount.toLocaleString("es-MX")}${
                  applyMeta.salary_expectation_currency
                    ? ` ${applyMeta.salary_expectation_currency}`
                    : ""
                }`}
              />
            ) : null}
            {(applyMeta.screening_answers ?? []).map((a) => (
              <AnswerRow
                key={a.id}
                label={a.prompt ?? ""}
                value={String(a.answer)}
              />
            ))}
          </dl>
        </div>
      ) : null}

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
                  Save
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

function AnswerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground sm:w-56">
        {label}
      </dt>
      <dd className="min-w-0 whitespace-pre-wrap text-xs text-foreground">
        {value}
      </dd>
    </div>
  );
}
