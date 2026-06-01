"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Sparkles, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import { streamKickoffRun } from "@/lib/kickoff/run-client";
import type { KickoffMaterials, KickoffSetupAnswers } from "@/lib/kickoff/types";
import { createJobAction } from "../../actions";
import { CompanyCombobox } from "./company-combobox";
import type { ProcessTemplateOption } from "./new-job-form";

/**
 * Intake-first create flow. The recruiter only picks a company
 * (optional) and a pipeline, then pastes the intake / drops PDFs; we
 * create the vacante with a blank title and run the kickoff inline so
 * the AI infers the title, location and the full package. On success we
 * land straight on the generated Paquete.
 */
export function IntakeFirstForm({
  templates,
  onBack,
}: {
  templates: ProcessTemplateOption[];
  onBack: () => void;
}) {
  const t = useT();
  const router = useRouter();

  const defaultTemplate =
    templates.find((tpl) => tpl.is_default) ?? templates[0] ?? null;
  const [templateId, setTemplateId] = useState<string | null>(
    defaultTemplate?.id ?? null,
  );
  const [companyId, setCompanyId] = useState<string>("");
  const [materials, setMaterials] = useState("");
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!materials.trim() && pdfFiles.length === 0) {
      setError(t("jobsList.intakeNeedMaterials"));
      return;
    }
    setError(null);
    start(async () => {
      // 1. Create the shell vacante (blank title — kickoff backfills it).
      const created = await createJobAction({
        companyId: companyId || null,
        title: "",
        inferDetails: true,
        processTemplateId: templateId,
      });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const jobId = created.data.jobId;

      // 2. Run the kickoff inline against the fresh vacante.
      setPhaseMessage(t("kickoff.connecting"));
      const setupAnswers: KickoffSetupAnswers = {
        jd_language: "es",
        outreach_language: "es",
        role_snapshot_includes: {
          salary: false,
          company_name: Boolean(companyId),
        },
        use_emojis: false,
        ai_process_language: "es",
        create_assessment: false,
      };
      const kickoffMaterials: KickoffMaterials = {
        intake_transcript: materials,
      };
      const res = await streamKickoffRun({
        jobId,
        materials: kickoffMaterials,
        setupAnswers,
        runKind: "kickoff",
        promptKey: null,
        files: pdfFiles,
        onPhase: (_phase, message) => setPhaseMessage(message),
      });
      setPhaseMessage(null);
      if (!res.ok) {
        // The vacante exists (blank title) — surface the error but still
        // route the recruiter to it so the partial create isn't lost.
        setError(`${t("jobsList.intakeFailed")}: ${res.error}`);
        toast.actionFailed(t("jobsList.intakeFailed"), res.error);
        router.push(`/jobs/${jobId}`);
        router.refresh();
        return;
      }
      toast.actionOk(t("kickoff.toastJobGenerated"));
      router.push(`/jobs/${jobId}/paquete`);
      router.refresh();
    });
  }

  if (isPending && phaseMessage) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <p className="text-sm font-medium">{phaseMessage}</p>
        <p className="text-xs text-muted-foreground">
          {t("kickoff.emptyDescription")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        {t("jobsList.chooserBack")}
      </button>

      <Field label={t("jobsList.fieldCompany")}>
        <CompanyCombobox
          defaultCompany={null}
          onChange={(c) => setCompanyId(c?.id ?? "")}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("jobsList.fieldCompanyHelp")}
        </p>
      </Field>

      <Field label={t("jobsList.fieldProcess")} required>
        {templates.length === 0 ? (
          <div className="rounded-md border border-border bg-bg-3 px-3 py-2 text-xs text-muted-foreground">
            {t("jobsList.noTemplates")}
          </div>
        ) : (
          <Select
            value={templateId ?? ""}
            onChange={(v) => setTemplateId(v || null)}
            searchable={templates.length > 8}
            options={templates.map((tpl) => ({
              value: tpl.id,
              label: tpl.is_default
                ? t("jobsList.templateDefault", { name: tpl.name })
                : tpl.name,
            }))}
          />
        )}
      </Field>

      <Field label={t("jobsList.intakeMaterialsLabel")} required>
        <textarea
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
          rows={8}
          autoFocus
          placeholder={t("jobsList.intakeMaterialsPlaceholder")}
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Paperclip className="h-3.5 w-3.5" />
            {t("jobsList.intakeAttachPdf")}
          </button>
          {pdfFiles.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              {pdfFiles.length === 1
                ? t("jobsList.intakePdfCountOne", { count: pdfFiles.length })
                : t("jobsList.intakePdfCountMany", { count: pdfFiles.length })}
              <button
                type="button"
                onClick={() => setPdfFiles([])}
                aria-label={t("jobsList.close")}
                className="hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) setPdfFiles((cur) => [...cur, ...files]);
            }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("jobsList.intakeMaterialsHelp")}
        </p>
      </Field>

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-danger-soft bg-danger-soft/40 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending} className="btn-ai gap-2">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isPending ? t("jobsList.intakeGenerating") : t("jobsList.intakeGenerate")}
        </Button>
      </div>
    </form>
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
      <span className="text-xs font-medium text-fg-2">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
