"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "../../../_components/rich-text-editor";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { updateJobAction } from "../../../actions";
import type { ScreeningQuestion } from "@/lib/hiring/jsonb-shapes";

/**
 * Shape of the posting-relevant slice of the job row passed in by the
 * server page. Keeps the component's contract narrow (just the columns
 * we actually edit here) instead of dragging the full JobRow into the
 * client bundle.
 */
type PostingJob = {
  title: string;
  posting_language: "es" | "en";
  work_modality: string | null;
  location: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_place_id: string | null;
  contract_type: string | null;
  working_hours: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_frequency: "monthly" | "annual" | "weekly" | "hourly";
  show_salary_in_posting: boolean;
  require_cv: boolean;
  require_cover_letter: boolean;
  ask_for_location: boolean;
  ask_for_salary_expectations: boolean;
  screening_questions: ScreeningQuestion[];
};

/**
 * Comprehensive editor for the public-facing posting + apply form
 * config. Lives at /jobs/[id]/posting and replaces the old single
 * rich-text editor that used to be the Descripción tab.
 *
 * UX model: every field is autosaving (no global Save button). Text
 * inputs save on blur, dropdowns + toggles save on change, rich text
 * saves on blur. A tiny spinner appears next to the section header
 * while a save is in flight, and `toast.actionFailed` covers errors.
 *
 * Sections are collapsible — all expanded by default since the admin
 * is here to edit.
 */
export function PostingEditor({
  jobId,
  initialJob,
  initialHtml,
}: {
  jobId: string;
  initialJob: PostingJob;
  initialHtml: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<PostingJob>(initialJob);
  const [html, setHtml] = useState(initialHtml);
  const lastSavedHtml = useRef(initialHtml);
  // Tracks which logical field is currently saving so each section
  // can show its own spinner. Keyed by field name; multiple fields
  // can save concurrently in theory but in practice users edit one
  // at a time.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Re-hydrate when the server pushes fresh data (router.refresh).
  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);
  useEffect(() => {
    setHtml(initialHtml);
    lastSavedHtml.current = initialHtml;
  }, [initialHtml]);

  async function persist<K extends string>(
    key: K,
    payload: Parameters<typeof updateJobAction>[0],
    onFail: () => void,
  ) {
    setSavingKey(key);
    const res = await updateJobAction(payload);
    setSavingKey((cur) => (cur === key ? null : cur));
    if (!res.ok) {
      toast.actionFailed("No se pudo guardar", res.error);
      onFail();
      return false;
    }
    router.refresh();
    return true;
  }

  function applyLocal(patch: Partial<PostingJob>) {
    setJob((cur) => ({ ...cur, ...patch }));
  }

  // ----- Field-level commits. Each takes the next value, applies it
  // locally (optimistic), and rolls back on failure.

  async function commitText(
    key: keyof PostingJob,
    actionKey: string,
    next: string | null,
    payloadField: keyof Parameters<typeof updateJobAction>[0],
  ) {
    const prev = job[key] as string | null;
    if ((prev ?? "") === (next ?? "")) return;
    applyLocal({ [key]: next } as Partial<PostingJob>);
    await persist(
      actionKey,
      { jobId, [payloadField]: next } as Parameters<typeof updateJobAction>[0],
      () => applyLocal({ [key]: prev } as Partial<PostingJob>),
    );
  }

  async function commitNumber(
    key: "salary_min" | "salary_max",
    payloadField: "salaryMin" | "salaryMax",
    next: number | null,
  ) {
    const prev = job[key];
    if (prev === next) return;
    applyLocal({ [key]: next } as Partial<PostingJob>);
    await persist(
      payloadField,
      { jobId, [payloadField]: next } as Parameters<typeof updateJobAction>[0],
      () => applyLocal({ [key]: prev } as Partial<PostingJob>),
    );
  }

  async function commitToggle(
    key:
      | "show_salary_in_posting"
      | "require_cv"
      | "require_cover_letter"
      | "ask_for_location"
      | "ask_for_salary_expectations",
    payloadField:
      | "showSalaryInPosting"
      | "requireCv"
      | "requireCoverLetter"
      | "askForLocation"
      | "askForSalaryExpectations",
    next: boolean,
  ) {
    const prev = job[key];
    applyLocal({ [key]: next } as Partial<PostingJob>);
    await persist(
      payloadField,
      { jobId, [payloadField]: next } as Parameters<typeof updateJobAction>[0],
      () => applyLocal({ [key]: prev } as Partial<PostingJob>),
    );
  }

  async function commitHtml() {
    if (html === lastSavedHtml.current) return;
    const prev = lastSavedHtml.current;
    lastSavedHtml.current = html;
    const ok = await persist(
      "publicDescription",
      { jobId, publicDescription: html },
      () => {
        lastSavedHtml.current = prev;
        setHtml(prev);
      },
    );
    if (!ok) return;
  }

  async function commitScreeningQuestions(next: ScreeningQuestion[]) {
    const prev = job.screening_questions;
    applyLocal({ screening_questions: next });
    await persist(
      "screeningQuestions",
      { jobId, screeningQuestions: next },
      () => applyLocal({ screening_questions: prev }),
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 py-4">
      {/* ---------------- Información básica ---------------- */}
      <Section title="Información básica" saving={isSaving(savingKey, [
        "title", "postingLanguage", "workModality", "location"
      ])}>
        <Field label="Título del puesto">
          <TextInput
            value={job.title}
            onCommit={(v) =>
              commitText("title", "title", v, "title").then(() => undefined)
            }
            placeholder="Sr Growth Director"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Idioma de la publicación">
            <SelectInput
              value={job.posting_language}
              onChange={(v) => {
                applyLocal({ posting_language: v as "es" | "en" });
                void persist(
                  "postingLanguage",
                  { jobId, postingLanguage: v as "es" | "en" },
                  () =>
                    applyLocal({ posting_language: job.posting_language }),
                );
              }}
              options={[
                { value: "es", label: "Español" },
                { value: "en", label: "English" },
              ]}
            />
          </Field>
          <Field label="Modalidad de trabajo">
            <SelectInput
              value={job.work_modality ?? ""}
              onChange={(v) => {
                const next = v || null;
                applyLocal({ work_modality: next });
                void persist(
                  "workModality",
                  { jobId, workModality: next },
                  () => applyLocal({ work_modality: job.work_modality }),
                );
              }}
              options={[
                { value: "", label: "Sin especificar" },
                { value: "remote", label: "Remoto" },
                { value: "hybrid", label: "Híbrido" },
                { value: "onsite", label: "Presencial" },
              ]}
            />
          </Field>
        </div>
        <Field label="Ubicación">
          <TextInput
            value={job.location ?? ""}
            onCommit={(v) =>
              commitText("location", "location", v || null, "location").then(
                () => undefined,
              )
            }
            placeholder="Ciudad de México, México"
          />
        </Field>
      </Section>

      {/* ---------------- Detalles de contrato ---------------- */}
      <Section
        title="Detalles de contrato"
        saving={isSaving(savingKey, ["contractType", "workingHours"])}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tipo de contrato">
            <SelectInput
              value={job.contract_type ?? ""}
              onChange={(v) => {
                const next = v || null;
                applyLocal({ contract_type: next });
                void persist(
                  "contractType",
                  { jobId, contractType: next },
                  () => applyLocal({ contract_type: job.contract_type }),
                );
              }}
              options={[
                { value: "", label: "Sin especificar" },
                { value: "permanent", label: "Permanente" },
                { value: "temporary", label: "Temporal" },
                { value: "contractor", label: "Contractor" },
                { value: "internship", label: "Becario" },
              ]}
            />
          </Field>
          <Field label="Jornada">
            <SelectInput
              value={job.working_hours ?? ""}
              onChange={(v) => {
                const next = v || null;
                applyLocal({ working_hours: next });
                void persist(
                  "workingHours",
                  { jobId, workingHours: next },
                  () => applyLocal({ working_hours: job.working_hours }),
                );
              }}
              options={[
                { value: "", label: "Sin especificar" },
                { value: "full_time", label: "Tiempo completo" },
                { value: "part_time", label: "Medio tiempo" },
                { value: "flexible", label: "Flexible" },
              ]}
            />
          </Field>
        </div>
      </Section>

      {/* ---------------- Salario ---------------- */}
      <Section
        title="Salario"
        saving={isSaving(savingKey, [
          "salaryMin",
          "salaryMax",
          "salaryCurrency",
          "salaryFrequency",
          "showSalaryInPosting",
        ])}
        actions={
          <ToggleSwitch
            label="Mostrar en la publicación"
            checked={job.show_salary_in_posting}
            onChange={(v) =>
              void commitToggle(
                "show_salary_in_posting",
                "showSalaryInPosting",
                v,
              )
            }
          />
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Mínimo">
            <NumberInput
              value={job.salary_min}
              onCommit={(v) => void commitNumber("salary_min", "salaryMin", v)}
              placeholder="Min"
            />
          </Field>
          <Field label="Máximo">
            <NumberInput
              value={job.salary_max}
              onCommit={(v) => void commitNumber("salary_max", "salaryMax", v)}
              placeholder="Max"
            />
          </Field>
          <Field label="Moneda">
            <SelectInput
              value={job.salary_currency ?? "MXN"}
              onChange={(v) => {
                applyLocal({ salary_currency: v });
                void persist(
                  "salaryCurrency",
                  { jobId, salaryCurrency: v },
                  () => applyLocal({ salary_currency: job.salary_currency }),
                );
              }}
              options={[
                { value: "MXN", label: "MXN" },
                { value: "USD", label: "USD" },
                { value: "EUR", label: "EUR" },
              ]}
            />
          </Field>
          <Field label="Frecuencia">
            <SelectInput
              value={job.salary_frequency}
              onChange={(v) => {
                const next = v as PostingJob["salary_frequency"];
                applyLocal({ salary_frequency: next });
                void persist(
                  "salaryFrequency",
                  { jobId, salaryFrequency: next },
                  () => applyLocal({ salary_frequency: job.salary_frequency }),
                );
              }}
              options={[
                { value: "monthly", label: "Mensual" },
                { value: "annual", label: "Anual" },
                { value: "weekly", label: "Semanal" },
                { value: "hourly", label: "Por hora" },
              ]}
            />
          </Field>
        </div>
      </Section>

      {/* ---------------- Descripción del puesto ---------------- */}
      <Section
        title="Descripción del puesto"
        saving={savingKey === "publicDescription"}
      >
        <div onBlur={() => void commitHtml()}>
          <RichTextEditor
            value={html}
            onChange={setHtml}
            placeholder="Empieza a escribir la descripción del puesto…"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Se guarda automáticamente al salir del editor.
        </p>
      </Section>

      {/* ---------------- Configuración de aplicación ---------------- */}
      <Section
        title="Configuración de aplicación"
        subtitle="Configura qué deben enviar los candidatos al aplicar."
        saving={isSaving(savingKey, [
          "requireCv",
          "askForLocation",
          "askForSalaryExpectations",
        ])}
      >
        {/* Nombre, teléfono y correo van siempre — son la información
            mínima para contactar al candidato y no son configurables. */}
        <p className="rounded-md bg-bg-2 px-3 py-2 text-xs text-muted-foreground">
          Nombre, teléfono y correo siempre se piden — son los datos mínimos
          para contactar al candidato.
        </p>
        <ToggleRow
          label="Pedir CV"
          description="Los candidatos deben subir un CV para aplicar."
          checked={job.require_cv}
          onChange={(v) => void commitToggle("require_cv", "requireCv", v)}
        />
        <ToggleRow
          label="Pedir ubicación"
          description="Muestra un campo de ubicación en el formulario."
          checked={job.ask_for_location}
          onChange={(v) =>
            void commitToggle("ask_for_location", "askForLocation", v)
          }
        />
        <ToggleRow
          label="Pedir expectativas de salario"
          description="Muestra un campo de salario esperado en el formulario."
          checked={job.ask_for_salary_expectations}
          onChange={(v) =>
            void commitToggle(
              "ask_for_salary_expectations",
              "askForSalaryExpectations",
              v,
            )
          }
        />
      </Section>

      {/* ---------------- Preguntas personalizadas ---------------- */}
      <Section
        title="Preguntas personalizadas"
        subtitle="Agrega preguntas de screening para que los candidatos respondan."
        saving={savingKey === "screeningQuestions"}
        defaultCollapsed
      >
        <ScreeningQuestionsList
          questions={job.screening_questions}
          onChange={(next) => void commitScreeningQuestions(next)}
        />
      </Section>
    </div>
  );
}

// ===================================================================
// Sub-components
// ===================================================================

function isSaving(key: string | null, keys: string[]): boolean {
  return key !== null && keys.includes(key);
}

function Section({
  title,
  subtitle,
  saving,
  actions,
  defaultCollapsed = false,
  children,
}: {
  title: string;
  subtitle?: string;
  saving?: boolean;
  actions?: React.ReactNode;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <section className="rounded-lg border border-border bg-bg-1">
      <header className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
        </button>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onCommit(local.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setLocal(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
    />
  );
}

function NumberInput({
  value,
  onCommit,
  placeholder,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");
  useEffect(() => setLocal(value?.toString() ?? ""), [value]);
  return (
    <Input
      type="number"
      inputMode="numeric"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const trimmed = local.trim();
        if (trimmed === "") {
          onCommit(null);
          return;
        }
        const n = Number(trimmed);
        if (Number.isNaN(n)) {
          setLocal(value?.toString() ?? "");
          return;
        }
        onCommit(n);
      }}
      placeholder={placeholder}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-border bg-bg-1 px-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  // The track is `h-5 w-9` (20×36 px) with `p-0.5` padding (2 px each
  // side), leaving 32 px of usable inner width for the 16 px thumb.
  // The thumb slides between `translate-x-0` (left edge) and
  // `translate-x-4` (16 px → right edge). Using a flex parent + a
  // block thumb instead of absolute positioning eliminates the math
  // mistake from the prior version, where the thumb spilled past the
  // pill's right edge.
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-accent" : "bg-bg-3",
        )}
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </button>
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <ToggleSwitch label="" checked={checked} onChange={onChange} />
    </div>
  );
}

// ===================================================================
// Screening questions sub-editor
// ===================================================================

const KIND_LABELS: Record<ScreeningQuestion["kind"], string> = {
  yes_no: "Sí / No",
  short_text: "Texto corto",
  multi_choice: "Opción múltiple",
  number: "Número",
};

function ScreeningQuestionsList({
  questions,
  onChange,
}: {
  questions: ScreeningQuestion[];
  onChange: (next: ScreeningQuestion[]) => void;
}) {
  function addQuestion() {
    const next: ScreeningQuestion = {
      id: crypto.randomUUID(),
      prompt: "",
      kind: "short_text",
      required: false,
    };
    onChange([...questions, next]);
  }

  function patchAt(idx: number, patch: Partial<ScreeningQuestion>) {
    onChange(questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function removeAt(idx: number) {
    onChange(questions.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {questions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aún no hay preguntas. Agrega la primera para empezar.
        </p>
      ) : (
        <ul className="space-y-2">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className="space-y-2 rounded-md border border-border bg-bg-2 p-3"
            >
              <Input
                value={q.prompt}
                onChange={(e) => patchAt(i, { prompt: e.target.value })}
                placeholder="¿Cuántos años de experiencia tienes con X?"
                className="h-9"
              />
              <div className="flex items-center justify-between gap-3">
                <SelectInput
                  value={q.kind}
                  onChange={(v) =>
                    patchAt(i, { kind: v as ScreeningQuestion["kind"] })
                  }
                  options={(
                    Object.keys(KIND_LABELS) as ScreeningQuestion["kind"][]
                  ).map((k) => ({ value: k, label: KIND_LABELS[k] }))}
                />
                <label className="inline-flex shrink-0 items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(q.required)}
                    onChange={(e) =>
                      patchAt(i, { required: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  Obligatoria
                </label>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  aria-label="Eliminar pregunta"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={addQuestion}
        className="gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar pregunta
      </Button>
    </div>
  );
}
