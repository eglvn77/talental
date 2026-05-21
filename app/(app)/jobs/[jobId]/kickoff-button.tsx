"use client";

import { useEffect, useState, useTransition } from "react";
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
import { runKickoffAction } from "@/app/(app)/kickoff/actions";
import type {
  KickoffMaterials,
  KickoffSetupAnswers,
  KickoffRunKind,
} from "@/lib/kickoff/types";
import type { RoleType } from "@/lib/hiring";

const PROGRESS_MESSAGES = [
  "Leyendo materiales…",
  "Identificando los selling points del rol…",
  "Estructurando el Job Description…",
  "Definiendo Sourcing Guidelines…",
  "Diseñando las AI Interview Questions…",
  "Escribiendo la outreach sequence…",
  "Cerrando el kickoff checklist…",
];

export function KickoffButton({
  jobId,
  initialRoleType,
  hasContent,
}: {
  jobId: string;
  initialRoleType: RoleType | null;
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

  // Materials
  const [intakeTranscript, setIntakeTranscript] = useState("");
  const [clientJd, setClientJd] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [calibrationContext, setCalibrationContext] = useState("");

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);

  // Cycle progress messages while pending so the user has feedback.
  useEffect(() => {
    if (!pending) return;
    setProgressIndex(0);
    const id = setInterval(() => {
      setProgressIndex((i) => (i + 1) % PROGRESS_MESSAGES.length);
    }, 6000);
    return () => clearInterval(id);
  }, [pending]);

  const isAiRole =
    roleType === "hybrid_ai_hunting" || roleType === "inbound_ai_driven";

  function onSubmit() {
    if (runKind === "kickoff" && !intakeTranscript.trim()) {
      setError("La transcripción del intake call es requerida.");
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
      const materials: KickoffMaterials = {
        intake_transcript: intakeTranscript,
        client_jd: clientJd || undefined,
        additional_context: additionalContext || undefined,
        calibration_context:
          runKind === "calibration" ? calibrationContext || undefined : undefined,
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
        runKind === "kickoff" ? "Kickoff listo" : "Calibración aplicada",
        {
          description:
            conflicts.length > 0
              ? `${conflicts.length} contradicción${conflicts.length === 1 ? "" : "es"} resuelta${conflicts.length === 1 ? "" : "s"} entre intake y JD.`
              : undefined,
        },
      );
      setOpen(false);
      router.push(`/jobs/${jobId}/setup`);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant={hasContent ? "outline" : "default"}
        className="gap-1.5"
      >
        {hasContent ? (
          <RotateCw className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {hasContent ? "Calibración" : "Kickoff"}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {hasContent
                ? "Calibrar vacante"
                : "Generar kickoff de la vacante"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1">
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
                <Field label="Idioma del Outreach + LinkedIn Post">
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

              <Field label="Incluir en role snapshot (arriba del JD y a un lado en el job post)">
                <div className="flex flex-col gap-2">
                  <Checkbox
                    checked={includeSalary}
                    onChange={setIncludeSalary}
                    label="Salario / Compensation"
                    disabled={pending}
                  />
                  <Checkbox
                    checked={includeCompanyName}
                    onChange={setIncludeCompanyName}
                    label="Nombre de la empresa"
                    disabled={pending}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Ubicación y work mode siempre se incluyen.
                </p>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Headers con emojis">
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
                <Field label="Crear assessment">
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
                <Field label="Idioma del AI process (Application + AI Interview)">
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
            </Section>

            <Section title="Materiales">
              <Field
                label={
                  runKind === "kickoff"
                    ? "Transcripción del Intake Call"
                    : "Transcripción del Intake Call (opcional en calibración)"
                }
                required={runKind === "kickoff"}
              >
                <textarea
                  value={intakeTranscript}
                  onChange={(e) => setIntakeTranscript(e.target.value)}
                  rows={10}
                  disabled={pending}
                  placeholder="Pega aquí la transcripción completa del kickoff con el cliente."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                />
              </Field>

              <Field label="JD del cliente (opcional)">
                <textarea
                  value={clientJd}
                  onChange={(e) => setClientJd(e.target.value)}
                  rows={5}
                  disabled={pending}
                  placeholder="Pega aquí el job description que mandó el cliente (si aplica)."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                />
              </Field>

              <Field label="Contexto adicional (opcional)">
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  rows={3}
                  disabled={pending}
                  placeholder="Notas internas, links, contexto del cliente, etc."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                />
              </Field>

              {runKind === "calibration" ? (
                <Field label="Contexto de calibración">
                  <textarea
                    value={calibrationContext}
                    onChange={(e) => setCalibrationContext(e.target.value)}
                    rows={5}
                    disabled={pending}
                    placeholder="Transcripción del debrief, feedback del cliente, lo que cambió desde el último kickoff…"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                  />
                </Field>
              ) : null}
            </Section>

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <div className="text-xs text-muted-foreground">
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {PROGRESS_MESSAGES[progressIndex]}
                </span>
              ) : (
                "La generación puede tardar 30 a 90 segundos."
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={pending}
                className="gap-2"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending
                  ? "Generando…"
                  : hasContent
                    ? "Aplicar calibración"
                    : "Generar kickoff"}
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
