"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Sparkles, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import { streamKickoffRun } from "@/lib/kickoff/run-client";
import type { KickoffSetupAnswers } from "@/lib/kickoff/types";
import type { CustomFieldDefinitionRow } from "@/lib/hiring";
import { CustomFieldsBlock } from "@/app/(app)/_components/custom-fields-block";
import { upsertCustomFieldValueAction } from "@/app/(app)/settings/actions";
import { createJobAction } from "../../actions";
import { CompanyCombobox } from "./company-combobox";
import { LocationAutocomplete } from "./location-autocomplete";
import type { ProcessTemplateOption } from "./new-job-form";

/**
 * Unified create-vacante modal. One screen: paste the intake (+ PDFs),
 * pick a company + pipeline, optionally type a title/location, and fill
 * the job custom fields. Two actions:
 *  - "Crear borrador": minimal, skips the AI — just creates the draft.
 *  - "Crear y generar con IA": creates the draft and runs the kickoff
 *    inline, which infers the title/location/modality/salary and builds
 *    the full package, landing on the Paquete.
 * Both leave the vacante in the workspace's default (borrador) status.
 */

const REQUIRED_LANG_KEY = "idioma_jd";

function mapLang(v: unknown): "es" | "en" | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "en" || s === "english" || s.startsWith("ing")) return "en";
  if (s === "es" || s === "spanish" || s.startsWith("esp")) return "es";
  return null;
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function CreateJobForm({
  templates,
  customFieldDefs,
  kickoffPrompts = [],
}: {
  templates: ProcessTemplateOption[];
  customFieldDefs: CustomFieldDefinitionRow[];
  kickoffPrompts?: Array<{ key: string; label: string; is_default: boolean }>;
}) {
  const t = useT();
  const router = useRouter();

  const defaultTemplate =
    templates.find((tpl) => tpl.is_default) ?? templates[0] ?? null;
  const [templateId, setTemplateId] = useState<string | null>(
    defaultTemplate?.id ?? null,
  );
  // Which kickoff prompt the AI should run. Defaults to the workspace
  // default; the user can override if there are alternatives.
  const [promptKey, setPromptKey] = useState<string | null>(
    () =>
      kickoffPrompts.find((p) => p.is_default)?.key ??
      kickoffPrompts[0]?.key ??
      null,
  );
  const [companyId, setCompanyId] = useState<string>("");
  // When false the kickoff is told to omit the company from JD/
  // outreach AND jobs.show_company_in_posting is persisted false at
  // create — so a later toggle isn't needed. Defaults to true (the
  // DB default), only meaningful when a companyId is attached.
  const [showCompanyInPosting, setShowCompanyInPosting] = useState(true);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState<{
    location: string;
    placeId: string;
    lat: string;
    lng: string;
  } | null>(null);
  const [materials, setMaterials] = useState("");
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [cfValues, setCfValues] = useState<Record<string, unknown>>({});

  const [error, setError] = useState<string | null>(null);
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  const requiredMissing = useMemo(
    () =>
      customFieldDefs.some(
        (d) => d.is_required && isEmptyValue(cfValues[d.id]),
      ),
    [customFieldDefs, cfValues],
  );

  function locationArgs() {
    return {
      location: location?.location || undefined,
      locationLat: location?.lat ? Number(location.lat) : undefined,
      locationLng: location?.lng ? Number(location.lng) : undefined,
      locationPlaceId: location?.placeId || undefined,
    };
  }

  async function persistCustomFields(jobId: string) {
    for (const d of customFieldDefs) {
      const v = cfValues[d.id];
      if (isEmptyValue(v)) continue;
      await upsertCustomFieldValueAction({
        definitionId: d.id,
        entityId: jobId,
        value: v,
      });
    }
  }

  // ---- "Crear borrador": minimal, no AI ----
  function onCreateDraft() {
    if (!title.trim()) {
      setError(t("jobsList.draftNeedsTitle"));
      return;
    }
    setError(null);
    start(async () => {
      const res = await createJobAction({
        companyId: companyId || null,
        title,
        processTemplateId: templateId,
        showCompanyInPosting: companyId ? showCompanyInPosting : undefined,
        ...locationArgs(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await persistCustomFields(res.data.jobId);
      toast.actionOk(t("jobsList.toastCreated"));
      router.push(`/jobs/${res.data.jobId}`);
      router.refresh();
    });
  }

  // ---- "Crear y generar con IA": create + inline kickoff ----
  function onGenerate() {
    if (!materials.trim() && pdfFiles.length === 0) {
      setError(t("jobsList.intakeNeedMaterials"));
      return;
    }
    if (requiredMissing) {
      setError(t("jobsList.requiredFieldsMissing"));
      return;
    }
    setError(null);
    start(async () => {
      const created = await createJobAction({
        companyId: companyId || null,
        title: title.trim(),
        inferDetails: true,
        processTemplateId: templateId,
        showCompanyInPosting: companyId ? showCompanyInPosting : undefined,
        ...locationArgs(),
      });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const jobId = created.data.jobId;
      await persistCustomFields(jobId);

      // Derive package language from the idioma_jd custom field the user
      // just set (mirrors server-side role-config); defaults to es.
      const langDef = customFieldDefs.find((d) => d.key === REQUIRED_LANG_KEY);
      const lang = (langDef && mapLang(cfValues[langDef.id])) || "es";
      const setupAnswers: KickoffSetupAnswers = {
        jd_language: lang,
        outreach_language: lang,
        role_snapshot_includes: {
          salary: false,
          // The prompt uses this to decide whether to name the company
          // in the JD/outreach. Keep aligned with the persisted flag so
          // the body and the toggle agree from day one.
          company_name: Boolean(companyId) && showCompanyInPosting,
        },
        use_emojis: false,
        ai_process_language: lang,
        create_assessment: false,
      };

      setPhaseMessage(t("kickoff.connecting"));
      const run = await streamKickoffRun({
        jobId,
        materials: { intake_transcript: materials },
        setupAnswers,
        runKind: "kickoff",
        promptKey,
        files: pdfFiles,
        onPhase: (_phase, message) => setPhaseMessage(message),
      });
      setPhaseMessage(null);
      if (!run.ok) {
        setError(`${t("jobsList.intakeFailed")}: ${run.error}`);
        toast.actionFailed(t("jobsList.intakeFailed"), run.error);
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGenerate();
      }}
      className="space-y-5"
    >
      <Field label={t("jobsList.intakeMaterialsLabel")}>
        <textarea
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
          rows={7}
          autoFocus
          placeholder={t("jobsList.intakeMaterialsPlaceholder")}
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            {t("jobsList.intakeAttachPdf")}
            <input
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
          </label>
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
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("jobsList.intakeMaterialsHelp")}
        </p>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("jobsList.fieldCompany")}>
          <CompanyCombobox
            defaultCompany={null}
            onChange={(c) => setCompanyId(c?.id ?? "")}
          />
          {companyId ? (
            <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={showCompanyInPosting}
                onChange={(e) => setShowCompanyInPosting(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-accent"
              />
              <span>{t("jobsList.showCompanyInPostingLabel")}</span>
            </label>
          ) : null}
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
      </div>

      {kickoffPrompts.length > 1 ? (
        <Field label={t("kickoff.promptPickerLabel")}>
          <Select
            value={promptKey ?? ""}
            onChange={(v) => setPromptKey(v || null)}
            options={kickoffPrompts.map((p) => ({
              value: p.key,
              label: p.is_default
                ? t("kickoff.promptDefaultSuffix", { label: p.label })
                : p.label,
            }))}
          />
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("jobsList.titleOptionalLabel")}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("jobsList.fieldTitlePlaceholder")}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("jobsList.titleOptionalHint")}
          </p>
        </Field>
        <Field label={t("jobsList.fieldLocation")}>
          <LocationAutocomplete
            apiKey={mapsApiKey}
            onChange={(loc) => setLocation(loc)}
          />
        </Field>
      </div>

      {customFieldDefs.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("jobsList.customFieldsLabel")}
          </h3>
          <CustomFieldsBlock
            entityId=""
            deferred
            definitions={customFieldDefs}
            initialValues={{}}
            onLocalChange={(defId, value) =>
              setCfValues((cur) => ({ ...cur, [defId]: value }))
            }
          />
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-danger-soft bg-danger-soft/40 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={onCreateDraft}
        >
          {t("jobsList.createDraft")}
        </Button>
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
