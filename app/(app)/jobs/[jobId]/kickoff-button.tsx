"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, RotateCw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runKickoffAction } from "@/app/(app)/kickoff/actions";
import type {
  KickoffMaterials,
  KickoffSetupAnswers,
  KickoffRunKind,
} from "@/lib/kickoff/types";
import type { RoleType } from "@/lib/hiring";

function progressMessagesFor(roleType: RoleType): string[] {
  const msgs = [
    "Leyendo materiales…",
    "Identificando los selling points del rol…",
    "Estructurando el Job Description…",
  ];
  if (roleType !== "inbound_ai_driven") {
    msgs.push("Definiendo Sourcing Guidelines…");
  }
  if (roleType !== "full_headhunting") {
    msgs.push("Diseñando las AI Interview Questions…");
  }
  if (roleType !== "inbound_ai_driven") {
    msgs.push("Escribiendo la outreach sequence…");
  }
  msgs.push("Cerrando el kickoff checklist…");
  return msgs;
}

export function KickoffButton({
  jobId,
  initialRoleType,
  initialAssessmentLink,
  hasContent,
}: {
  jobId: string;
  initialRoleType: RoleType | null;
  initialAssessmentLink: string | null;
  hasContent: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const runKind: KickoffRunKind = hasContent ? "calibration" : "kickoff";

  // Form state
  const [roleType, setRoleType] = useState<RoleType>(
    initialRoleType ?? "full_headhunting",
  );
  const [jdLanguage, setJdLanguage] = useState<"es" | "en">("es");
  const [outreachLanguage, setOutreachLanguage] = useState<"es" | "en">("es");
  const [includeSalary, setIncludeSalary] = useState(false);
  const [includeCompanyName, setIncludeCompanyName] = useState(false);
  const [useEmojis, setUseEmojis] = useState(true);
  const [aiProcessLanguage, setAiProcessLanguage] = useState<"es" | "en">("es");
  const [createAssessment, setCreateAssessment] = useState(false);
  const [assessmentLink, setAssessmentLink] = useState(
    initialAssessmentLink ?? "",
  );

  // Materials
  const [intakeTranscript, setIntakeTranscript] = useState("");
  const [clientJd, setClientJd] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [calibrationContext, setCalibrationContext] = useState("");

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);

  const progressMessages = useMemo(
    () => progressMessagesFor(roleType),
    [roleType],
  );

  useEffect(() => {
    if (!pending) return;
    setProgressIndex(0);
    const id = setInterval(() => {
      setProgressIndex((i) => (i + 1) % progressMessages.length);
    }, 6000);
    return () => clearInterval(id);
  }, [pending, progressMessages.length]);

  const isAiRole =
    roleType === "hybrid_ai_hunting" || roleType === "inbound_ai_driven";

  function onSubmit() {
    if (runKind === "kickoff" && !intakeTranscript.trim()) {
      setError("La transcripción del intake call es requerida.");
      return;
    }
    if (runKind === "calibration" && !calibrationContext.trim()) {
      setError("Pega al menos un contexto para calibrar.");
      return;
    }
    if (
      runKind === "calibration" &&
      hasContent &&
      !confirm(
        "Esto regenera todo el contenido de los tabs y crea entradas nuevas en outreach y checklist. ¿Continuar?",
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const setupAnswers: KickoffSetupAnswers = {
        role_type: roleType,
        jd_language: jdLanguage,
        outreach_language: outreachLanguage,
        role_snapshot_includes: {
          salary: includeSalary,
          company_name: includeCompanyName,
        },
        use_emojis: useEmojis,
        ai_process_language: isAiRole ? aiProcessLanguage : null,
        create_assessment: createAssessment,
      };
      const materials: KickoffMaterials =
        runKind === "calibration"
          ? {
              intake_transcript: calibrationContext,
              client_jd: clientJd || undefined,
              calibration_context: calibrationContext,
              assessment_link: assessmentLink || undefined,
            }
          : {
              intake_transcript: intakeTranscript,
              client_jd: clientJd || undefined,
              additional_context: additionalContext || undefined,
              assessment_link: assessmentLink || undefined,
            };

      const res = await runKickoffAction({
        jobId,
        materials,
        setupAnswers,
        runKind,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      const conflicts = res.data.conflicts;
      toast.success(
        runKind === "kickoff" ? "Vacante generada" : "Calibración aplicada",
        {
          description:
            conflicts.length > 0
              ? `${conflicts.length} contradicción${conflicts.length === 1 ? "" : "es"} resuelta${conflicts.length === 1 ? "" : "s"} entre intake y JD.`
              : undefined,
        },
      );
      setOpen(false);
      router.push(`/jobs/${jobId}/overview`);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant="ghost"
        className={`gap-1.5 ${hasContent ? "btn-ai-outline" : "btn-ai"}`}
      >
        {hasContent ? (
          <RotateCw className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {hasContent ? "Calibrar" : "Kickoff"}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {hasContent
                ? "Calibrar la vacante"
                : "Generar la vacante"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid max-h-[68vh] gap-4 overflow-y-auto pr-1">
            <Section title="Setup">
              <Field label="Tipo de rol" required>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["full_headhunting", "Full Headhunting"],
                      ["hybrid_ai_hunting", "Hybrid AI + Hunting"],
                      ["inbound_ai_driven", "Inbound AI Driven"],
                    ] as Array<[RoleType, string]>
                  ).map(([v, label]) => (
                    <Radio
                      key={v}
                      checked={roleType === v}
                      onChange={() => setRoleType(v)}
                      label={label}
                      disabled={pending}
                    />
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Idioma del JD">
                  <Toggle
                    value={jdLanguage}
                    onChange={(v) => setJdLanguage(v as "es" | "en")}
                    options={[
                      { value: "es", label: "Español" },
                      { value: "en", label: "English" },
                    ]}
                    disabled={pending}
                  />
                </Field>
                <Field label="Idioma del Outreach + LinkedIn">
                  <Toggle
                    value={outreachLanguage}
                    onChange={(v) => setOutreachLanguage(v as "es" | "en")}
                    options={[
                      { value: "es", label: "Español" },
                      { value: "en", label: "English" },
                    ]}
                    disabled={pending}
                  />
                </Field>
              </div>

              <Field label="Mostrar en el anuncio de empleo">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <Checkbox
                    checked={includeSalary}
                    onChange={setIncludeSalary}
                    label="Salario"
                    disabled={pending}
                  />
                  <Checkbox
                    checked={includeCompanyName}
                    onChange={setIncludeCompanyName}
                    label="Nombre de la empresa"
                    disabled={pending}
                  />
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Incluir Emojis en JD">
                  <Toggle
                    value={useEmojis ? "yes" : "no"}
                    onChange={(v) => setUseEmojis(v === "yes")}
                    options={[
                      { value: "yes", label: "Sí" },
                      { value: "no", label: "No" },
                    ]}
                    disabled={pending}
                  />
                </Field>
                <Field label="Crear Assessment con AI">
                  <Toggle
                    value={createAssessment ? "yes" : "no"}
                    onChange={(v) => setCreateAssessment(v === "yes")}
                    options={[
                      { value: "yes", label: "Sí" },
                      { value: "no", label: "No" },
                    ]}
                    disabled={pending}
                  />
                </Field>
              </div>

              {isAiRole ? (
                <Field label="Idioma del AI process">
                  <Toggle
                    value={aiProcessLanguage}
                    onChange={(v) => setAiProcessLanguage(v as "es" | "en")}
                    options={[
                      { value: "es", label: "Español" },
                      { value: "en", label: "English" },
                    ]}
                    disabled={pending}
                  />
                </Field>
              ) : null}

              <Field label="Link del Assessment (opcional)">
                <Input
                  type="url"
                  value={assessmentLink}
                  onChange={(e) => setAssessmentLink(e.target.value)}
                  disabled={pending}
                  placeholder="https://… (Typeform, Notion, Google Form, etc.)"
                />
              </Field>
            </Section>

            <Section title="Materiales">
              {runKind === "kickoff" ? (
                <>
                  <Field label="Transcripción del Intake Call" required>
                    <textarea
                      value={intakeTranscript}
                      onChange={(e) => setIntakeTranscript(e.target.value)}
                      rows={10}
                      disabled={pending}
                      placeholder="Pega aquí la transcripción completa del kickoff con la empresa."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                    />
                  </Field>

                  <Field label="JD de la empresa (opcional)">
                    <textarea
                      value={clientJd}
                      onChange={(e) => setClientJd(e.target.value)}
                      rows={5}
                      disabled={pending}
                      placeholder="Pega el JD que mandó el cliente."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                    />
                  </Field>

                  <Field label="Contexto adicional (opcional)">
                    <textarea
                      value={additionalContext}
                      onChange={(e) => setAdditionalContext(e.target.value)}
                      rows={3}
                      disabled={pending}
                      placeholder="Notas internas, links, contexto de la empresa."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Contexto / Materiales" required>
                    <textarea
                      value={calibrationContext}
                      onChange={(e) => setCalibrationContext(e.target.value)}
                      rows={14}
                      disabled={pending}
                      placeholder="Pega transcripción del debrief, feedback de la empresa, notas — lo que tengas."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                    />
                  </Field>

                  <Field label="JD actualizado de la empresa (opcional)">
                    <textarea
                      value={clientJd}
                      onChange={(e) => setClientJd(e.target.value)}
                      rows={5}
                      disabled={pending}
                      placeholder="Solo si la empresa mandó un JD nuevo."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                    />
                  </Field>
                </>
              )}
            </Section>

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
            <div className="min-w-0 text-xs text-muted-foreground">
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {progressMessages[progressIndex]}
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
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={pending}
                variant="ghost"
                className="btn-ai gap-1.5"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {pending
                  ? "Generando…"
                  : hasContent
                    ? "Aplicar calibración"
                    : "Generar Vacante"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

function Radio({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={
        checked
          ? "rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground"
          : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
      }
    >
      {label}
    </button>
  );
}

function Toggle({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={
            value === o.value
              ? "bg-foreground px-3 py-1 text-xs text-background"
              : "bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4"
      />
      <span>{label}</span>
    </label>
  );
}
