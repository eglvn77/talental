"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FileText, Loader2, Paperclip, Sparkles, Wand2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import type { KickoffRunEvent } from "@/lib/kickoff/run";
import type {
  KickoffMaterials,
  KickoffSetupAnswers,
  KickoffRunKind,
} from "@/lib/kickoff/types";
import type { CustomFieldDefinitionRow } from "@/lib/hiring";
import { useDialogShortcuts } from "@/lib/use-dialog-shortcuts";

function kickoffProgressMessages(t: TFunction): string[] {
  // Role-agnostic now — the chosen kickoff prompt decides which
  // sections it produces, so the progress copy just lists the possible
  // stages without branching.
  return [
    t("kickoff.progressReading"),
    t("kickoff.progressSellingPoints"),
    t("kickoff.progressStructuringJd"),
    t("kickoff.progressRequirements"),
    t("kickoff.progressQuestionsSourcing"),
    t("kickoff.progressChecklist"),
  ];
}

export function KickoffButton({
  jobId,
  roleConfig,
  missingRequiredCustomFields = [],
  hasContent,
  kickoffPrompts = [],
}: {
  jobId: string;
  /** Kickoff-category prompts the recruiter can pick from. The default
   *  is pre-selected; the picker only renders when there's more than one. */
  kickoffPrompts?: Array<{ key: string; label: string; is_default: boolean }>;
  /**
   * The vacante's saved role configuration. `assessmentLink` lives on
   * the row; everything else is read from the workspace's `job` custom
   * field values (with safe defaults when not set). The role itself is
   * no longer here — it's decided by the kickoff prompt the user picks.
   */
  roleConfig: {
    jdLanguage: "es" | "en";
    outreachLanguage: "es" | "en";
    aiProcessLanguage: "es" | "en" | null;
    includeSalaryInPost: boolean;
    includeCompanyInPost: boolean;
    useEmojisInJd: boolean;
    createAssessment: boolean;
    assessmentLink: string | null;
  };
  /**
   * `job` custom field definitions flagged `is_required = true` that
   * don't yet have a value for this vacante. We render their inputs
   * inline at the top of the dialog and gate submit until each one
   * holds a non-empty value — no more bouncing the user to Ajustes.
   * CustomFieldsBlock autosaves on blur, so the values persist into
   * the job before kickoff runs.
   */
  missingRequiredCustomFields?: CustomFieldDefinitionRow[];
  hasContent: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Which kickoff prompt to run — defaults to the workspace default.
  const [promptKey, setPromptKey] = useState<string>(
    () =>
      kickoffPrompts.find((p) => p.is_default)?.key ??
      kickoffPrompts[0]?.key ??
      "",
  );
  // Per-run override for the outreach sequence's language. Initialized
  // from the saved role config so the dropdown remembers the workspace
  // default; the override is only used for THIS run — we don't persist
  // it back to roleConfig. The picker only exists here, intentionally.
  const [outreachLangOverride, setOutreachLangOverride] = useState<
    "es" | "en"
  >(roleConfig.outreachLanguage);
  // Same per-run override for the JD language. Critical for jobs
  // created as drafts ("Crear borrador") — those never went through
  // the create-modal's Idioma JD field, so roleConfig silently
  // defaulted to Spanish and the recruiter had no way to change it
  // at kickoff time. The picker renders on first kickoff only,
  // mirroring the outreach-language picker.
  const [jdLangOverride, setJdLangOverride] = useState<"es" | "en">(
    roleConfig.jdLanguage,
  );
  const runKind: KickoffRunKind = hasContent ? "calibration" : "kickoff";

  // Auto-open the dialog when the URL carries `?kickoff=1` — the
  // new-vacante chooser navigates here with that flag when the user
  // picks "Hacer kickoff" right after creating the vacante. We strip
  // the flag from the URL after opening so a refresh doesn't keep
  // re-popping the modal.
  useEffect(() => {
    if (searchParams?.get("kickoff") === "1") {
      setOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("kickoff");
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local mirror of the inline custom-field values so we can gate
  // submit reactively (CustomFieldsBlock saves on blur, so the
  // server-side `missing` list lags one round-trip behind). Seeded
  // from the definitions list — each entry starts at the field's
  // default (empty string / false / []) since the row had no value.
  const requiredDefs = missingRequiredCustomFields ?? [];
  const initialCustomFieldValues = useMemo<Record<string, unknown>>(() => {
    const seed: Record<string, unknown> = {};
    for (const d of requiredDefs) {
      seed[d.id] = d.kind === "boolean" ? false : d.kind === "multi_select" ? [] : "";
    }
    return seed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredDefs.length]);
  const [localFieldValues, setLocalFieldValues] = useState<
    Record<string, unknown>
  >(initialCustomFieldValues);

  // A required field is "filled" if its local value is non-empty for
  // its kind. Mirrors the server-side `loadRequiredJobCustomFieldsMissing`
  // emptiness rules so we don't gate submit on something the server
  // would also reject.
  function isFilled(d: CustomFieldDefinitionRow, v: unknown): boolean {
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "boolean") return true; // any explicit boolean is "filled"
    return true;
  }
  const outstandingRequired = requiredDefs.filter(
    (d) => !isFilled(d, localFieldValues[d.id]),
  );

  // Materialize the saved config as locals so the rest of the file
  // doesn't have to drill through `roleConfig.` everywhere. Fallbacks
  // mirror the previous in-dialog defaults so behaviour is identical
  // for any vacante whose row predates the columns.
  const jdLanguage = jdLangOverride;
  // The dialog's outreach-language override wins for this run; the
  // saved config stays untouched so the next kickoff inherits it.
  const outreachLanguage = outreachLangOverride;
  const includeSalary = roleConfig.includeSalaryInPost;
  const includeCompanyName = roleConfig.includeCompanyInPost;
  const useEmojis = roleConfig.useEmojisInJd;
  const aiProcessLanguage: "es" | "en" = roleConfig.aiProcessLanguage ?? "es";
  const createAssessment = roleConfig.createAssessment;
  const assessmentLink = roleConfig.assessmentLink ?? "";

  // Single materials blob — the recruiter pastes everything they
  // have (intake transcript, client JD, internal notes, links) into
  // one textarea. The model parses better from a coherent stream
  // than from three half-empty per-purpose boxes, and the UI stays
  // ruthlessly simple.
  const [materialsText, setMaterialsText] = useState("");
  // Optional PDF attachments. Server extracts text and concatenates
  // to the materials blob before the model call — no client-side
  // parsing (pdf-parse is Node-only). Max 3 files, 10MB each.
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [calibrationConfirm, setCalibrationConfirm] = useState(false);

  // Server-driven progress (replaces the old elapsed-time scroller).
  // `phaseMessage` is the human-readable label for the current phase;
  // `tokenChars` is the rolling count of JSON characters Claude has
  // emitted so the user sees real movement during the generating phase.
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  // Stable phase enum from the server (locale-independent) — drives the
  // "generating" UX branches so they don't depend on the localized label.
  const [phase, setPhase] = useState<string | null>(null);
  const [tokenChars, setTokenChars] = useState(0);

  // While "generating" is active, cycle role-specific subtitles so the
  // user sees variety beyond the static phase label. Pure UX texture —
  // the truth comes from the server events.
  const subtitles = useMemo(() => kickoffProgressMessages(t), [t]);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  useEffect(() => {
    if (phase !== "generating") return;
    setSubtitleIndex(0);
    const id = setInterval(() => {
      setSubtitleIndex((i) => (i + 1) % subtitles.length);
    }, 6000);
    return () => clearInterval(id);
  }, [phase, subtitles.length]);

  useDialogShortcuts({
    enabled: open,
    onSubmit: () => onSubmit(),
    onCancel: () => {
      if (!pending) setOpen(false);
    },
  });

  function onSubmit() {
    // Custom-field validation removed — the kickoff dialog no longer
    // surfaces them. The fields still exist on the job's own tabs.
    // Either textarea OR at least one PDF must provide content.
    if (!materialsText.trim() && pdfFiles.length === 0) {
      setError(
        runKind === "kickoff"
          ? t("kickoff.errorNoMaterials")
          : t("kickoff.errorNoCalibrationContext"),
      );
      return;
    }
    if (runKind === "calibration" && hasContent) {
      // Defer to the ConfirmDialog; submit() is re-invoked after the
      // user confirms.
      setCalibrationConfirm(true);
      return;
    }
    runGeneration();
  }

  function runGeneration() {
    setError(null);
    setPhaseMessage(t("kickoff.connecting"));
    setPhase(null);
    setTokenChars(0);
    startTransition(async () => {
      const setupAnswers: KickoffSetupAnswers = {
        jd_language: jdLanguage,
        outreach_language: outreachLanguage,
        role_snapshot_includes: {
          salary: includeSalary,
          company_name: includeCompanyName,
        },
        use_emojis: useEmojis,
        ai_process_language: aiProcessLanguage,
        create_assessment: createAssessment,
      };
      // Single materials blob: the textarea catches transcript +
      // JD + internal notes together. We funnel it into the
      // primary field for each kind (intake_transcript for kickoff,
      // calibration_context for calibration) and leave the other
      // fields blank — the prompt template handles a missing
      // secondary field gracefully.
      const materials: KickoffMaterials =
        runKind === "calibration"
          ? {
              intake_transcript: materialsText,
              calibration_context: materialsText,
              assessment_link: assessmentLink || undefined,
            }
          : {
              intake_transcript: materialsText,
              assessment_link: assessmentLink || undefined,
            };

      let finalEvent: KickoffRunEvent | null = null;
      try {
        // Multipart when there are PDFs attached, JSON otherwise.
        // Server detects via content-type and extracts each PDF's
        // text server-side (pdf-parse is Node-only). Keeping JSON
        // as the no-attachments path means existing callers don't
        // pay the multipart overhead.
        const payload = {
          jobId,
          materials,
          setupAnswers,
          runKind,
          promptKey: promptKey || null,
        };
        let res: Response;
        if (pdfFiles.length > 0) {
          const fd = new FormData();
          fd.append("payload", JSON.stringify(payload));
          for (const f of pdfFiles) fd.append("files", f);
          res = await fetch("/api/kickoff/run", { method: "POST", body: fd });
        } else {
          res = await fetch("/api/kickoff/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        if (!res.ok || !res.body) {
          setError(`HTTP ${res.status}: ${await res.text()}`);
          setPhaseMessage(null);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        // SSE frames are separated by a blank line. Each frame starts
        // with `data: ` followed by JSON. We accumulate partial chunks
        // and split on the delimiter.
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            let event: KickoffRunEvent;
            try {
              event = JSON.parse(json) as KickoffRunEvent;
            } catch {
              continue;
            }
            if (event.type === "phase") {
              setPhaseMessage(event.message);
              setPhase(event.phase);
            } else if (event.type === "tokens") {
              setTokenChars(event.chars);
            } else if (event.type === "done" || event.type === "error") {
              finalEvent = event;
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhaseMessage(null);
        return;
      }

      setPhaseMessage(null);

      if (!finalEvent) {
        setError(t("kickoff.errorConnectionClosed"));
        return;
      }
      if (finalEvent.type === "error") {
        setError(finalEvent.error);
        return;
      }
      const conflicts = finalEvent.conflicts;
      const description =
        conflicts.length > 0
          ? conflicts.length === 1
            ? t("kickoff.conflictsResolvedOne", { count: conflicts.length })
            : t("kickoff.conflictsResolvedMany", { count: conflicts.length })
          : undefined;
      toast.actionOk(
        runKind === "kickoff"
          ? t("kickoff.toastJobGenerated")
          : t("kickoff.toastCalibrationApplied"),
        description,
      );
      setOpen(false);
      // The /overview tab was retired (folded into Resources) — land
      // the recruiter on the package the kickoff just generated.
      router.push(`/jobs/${jobId}/resources`);
      router.refresh();
    });
  }

  return (
    <>
      {/* Icon-only trigger with tooltip — matches the rest of the
          vacante chrome (Filtros, Vista, kebab). Both states use the
          solid AI gradient (`.btn-ai`) so the AI action is
          unmistakably "magic"; icons differ by intent — Sparkles
          for the initial Kickoff, Wand2 for re-calibration. */}
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        variant="ghost"
        aria-label={hasContent ? t("kickoff.calibrate") : t("kickoff.kickoff")}
        title={hasContent ? t("kickoff.calibrate") : t("kickoff.kickoff")}
        className="btn-ai gap-1.5"
      >
        {hasContent ? (
          <Wand2 className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {hasContent ? t("kickoff.calibrate") : t("kickoff.kickoff")}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {hasContent
                ? t("kickoff.dialogTitleCalibrate")
                : t("kickoff.dialogTitleGenerate")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid max-h-[68vh] gap-4 overflow-y-auto pr-1">
            {/* Missing REQUIRED job custom fields render inline so the
                recruiter can fill them without leaving the dialog.
                Without this block, the submit gate
                (outstandingRequired.length > 0) is a deadlock for
                draft-created jobs: the button stays disabled and
                nothing in the dialog explains why or lets you fix it.
                CustomFieldsBlock autosaves on blur (entity exists) and
                onLocalChange un-gates submit reactively. */}
            {requiredDefs.length > 0 ? (
              <Section title="Campos requeridos">{/* literal: shared i18n bundle is locked */}
                <CustomFieldsBlock
                  entityId={jobId}
                  definitions={requiredDefs}
                  initialValues={initialCustomFieldValues}
                  onLocalChange={(definitionId, value) =>
                    setLocalFieldValues((cur) => ({
                      ...cur,
                      [definitionId]: value,
                    }))
                  }
                />
              </Section>
            ) : null}

            {/* Prompt + languages only appear on first kickoff.
                Calibrate reuses the prompt the recruiter picked
                originally and keeps the existing languages —
                this dialog is for tweaking materials, not redefining
                the role. */}
            {!hasContent && kickoffPrompts.length > 1 ? (
              <Section title={t("kickoff.sectionPrompt")}>
                <Field label={t("kickoff.promptPickerLabel")}>
                  <Select
                    value={promptKey}
                    onChange={(v) => setPromptKey(v)}
                    disabled={pending}
                    options={kickoffPrompts.map((p) => ({
                      value: p.key,
                      label: p.is_default
                        ? t("kickoff.promptDefaultSuffix", { label: p.label })
                        : p.label,
                    }))}
                  />
                </Field>
              </Section>
            ) : null}

            {!hasContent ? (
              <Section title={t("kickoff.sectionOutreachLanguage")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* JD language — asked here so the draft-first flow
                      matches the create-with-AI flow (which asks via
                      the Idioma JD field in the create modal). Drafts
                      created via "Crear borrador" never answered it,
                      so without this picker the JD silently came out
                      in Spanish. Literal label: i18n bundle locked. */}
                  <Field label="Idioma de la job description">
                    <Select
                      value={jdLangOverride}
                      onChange={(v) =>
                        setJdLangOverride(v === "en" ? "en" : "es")
                      }
                      disabled={pending}
                      options={[
                        { value: "es", label: t("kickoff.langSpanish") },
                        { value: "en", label: t("kickoff.langEnglish") },
                      ]}
                    />
                  </Field>
                  <Field label={t("kickoff.outreachLanguageLabel")}>
                    <Select
                      value={outreachLangOverride}
                      onChange={(v) =>
                        setOutreachLangOverride(v === "en" ? "en" : "es")
                      }
                      disabled={pending}
                      options={[
                        { value: "es", label: t("kickoff.langSpanish") },
                        { value: "en", label: t("kickoff.langEnglish") },
                      ]}
                    />
                  </Field>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("kickoff.outreachLanguageHint")}
                </p>
              </Section>
            ) : null}

            <Section title={t("kickoff.sectionMaterials")}>
              <Field label={t("kickoff.materialsLabel")} required>
                <div className="space-y-2">
                  <textarea
                    value={materialsText}
                    onChange={(e) => setMaterialsText(e.target.value)}
                    rows={14}
                    disabled={pending}
                    placeholder={
                      runKind === "kickoff"
                        ? t("kickoff.materialsPlaceholderKickoff")
                        : t("kickoff.materialsPlaceholderCalibration")
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => pdfInputRef.current?.click()}
                      disabled={pending || pdfFiles.length >= 3}
                      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-bg-1 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-bg-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      {t("kickoff.attachPdf")}
                    </button>
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const incoming = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (incoming.length === 0) return;
                        setPdfFiles((cur) => {
                          // Cap total at 3, prefer the user's most-recent
                          // selection if they would have gone over.
                          const merged = [...cur, ...incoming];
                          if (merged.length > 3) merged.length = 3;
                          return merged;
                        });
                      }}
                    />
                    {pdfFiles.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-2 px-2 py-1 text-[11px] text-foreground"
                      >
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[180px] truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPdfFiles((cur) =>
                              cur.filter((_, j) => j !== i),
                            )
                          }
                          aria-label={t("kickoff.removeFile", { name: f.name })}
                          className="rounded text-muted-foreground hover:text-danger"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {pdfFiles.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">
                        {t("kickoff.pdfLimitHint")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Field>
            </Section>

            {error ? (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-md border border-danger-soft bg-danger-soft/40 px-3 py-2 text-xs text-danger"
              >
                {error}
              </p>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
            <div className="min-w-0 text-xs text-muted-foreground">
              {pending ? (
                <span
                  className="inline-flex items-center gap-2"
                  aria-live="polite"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="truncate">
                    {phaseMessage ?? t("kickoff.connecting")}
                    {phase === "generating" && tokenChars > 0
                      ? ` · ${t("kickoff.tokenChars", { count: Math.round(tokenChars / 100) / 10 })}`
                      : null}
                  </span>
                  {phase === "generating" ? (
                    <span className="hidden text-muted-foreground/70 sm:inline">
                      · {subtitles[subtitleIndex]}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {t("kickoff.cancel")}
              </Button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={pending || outstandingRequired.length > 0}
                title={
                  outstandingRequired.length > 0
                    ? t("kickoff.missingFields", {
                        fields: outstandingRequired
                          .map((f) => f.label)
                          .join(", "),
                      })
                    : undefined
                }
                variant="ghost"
                className="btn-ai gap-1.5"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {pending
                  ? t("kickoff.generating")
                  : hasContent
                    ? t("kickoff.applyCalibration")
                    : t("kickoff.generateJob")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={calibrationConfirm}
        onOpenChange={setCalibrationConfirm}
        title={t("kickoff.confirmCalibrateTitle")}
        description={t("kickoff.confirmCalibrateDescription")}
        confirmLabel={t("kickoff.confirmCalibrateLabel")}
        onConfirm={() => {
          setCalibrationConfirm(false);
          runGeneration();
        }}
      />
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

