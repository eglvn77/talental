"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Loader2, Paperclip, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { CareersJobDetail } from "../_lib/data";

/**
 * Shape of one screening question stored on jobs.screening_questions.
 * Mirrors lib/hiring/jsonb-shapes.ts — duplicated locally to keep the
 * public careers bundle from pulling the server hiring barrel.
 */
type ScreeningQuestion = {
  id: string;
  prompt: string;
  kind: "yes_no" | "short_text" | "multi_choice" | "number";
  required?: boolean;
  options?: string[];
};

/**
 * Public apply form. Lives in a Radix dialog opened from the job
 * posting body. Fields render conditionally based on the job's
 * apply-form toggles + screening_questions; the always-required
 * trio (nombre, email, teléfono) is hard-coded.
 *
 * Submits as multipart FormData to /api/careers/apply (so the CV
 * file rides along). Shows a success state in-place when the
 * server confirms — no redirect, the candidate can close the modal
 * and stays on the posting.
 */
export function ApplyModal({
  open,
  onOpenChange,
  job,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  job: CareersJobDetail;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  const screeningQuestions =
    (job.screening_questions as ScreeningQuestion[] | null) ?? [];

  function reset() {
    setError(null);
    setSuccess(false);
    setDuplicate(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("job_id", job.id);

    // Walk the screening question inputs, building a {id, prompt,
    // kind, answer} array. Stored on applications.source_meta so the
    // recruiter sees what the candidate said inline.
    if (screeningQuestions.length > 0) {
      const answers = screeningQuestions.map((q) => {
        const raw = fd.get(`sq_${q.id}`);
        fd.delete(`sq_${q.id}`);
        return {
          id: q.id,
          prompt: q.prompt,
          kind: q.kind,
          answer: raw === null ? "" : String(raw),
        };
      });
      fd.set("screening_answers", JSON.stringify(answers));
    }

    try {
      const res = await fetch("/api/careers/apply", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as
        | { ok: true; data?: { duplicate?: boolean } }
        | { ok: false; error: string };
      if (!json.ok) {
        setError(json.error);
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      setSuccess(true);
      setDuplicate(Boolean(json.data?.duplicate));
    } catch {
      setSubmitting(false);
      setError("No se pudo enviar la aplicación. Intenta de nuevo.");
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(95vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background shadow-modal">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-base font-semibold">
              Aplicar a {job.title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {success ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-positive-soft text-positive">
                <Check className="h-6 w-6" />
              </span>
              <p className="text-base font-medium text-foreground">
                {duplicate
                  ? "Ya habías aplicado a este rol."
                  : "¡Aplicación enviada!"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {duplicate
                  ? "Nuestro equipo ya tiene tu información — te contactaremos si avanzas a la siguiente etapa."
                  : "Recibimos tu información. Si tu perfil encaja, te contactaremos pronto."}
              </p>
              <Dialog.Close className="mt-2 rounded-md border border-border bg-bg-1 px-4 py-2 text-sm hover:bg-muted">
                Cerrar
              </Dialog.Close>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField label="Nombre completo" required>
                    <input
                      name="full_name"
                      required
                      autoComplete="name"
                      className={baseInput}
                    />
                  </FormField>
                  <FormField label="Correo electrónico" required>
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      className={baseInput}
                    />
                  </FormField>
                </div>

                <FormField label="Teléfono" required>
                  <input
                    name="phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    className={`${baseInput} max-w-md`}
                  />
                </FormField>

                {job.ask_for_location ? (
                  <FormField label="¿Dónde te encuentras?">
                    <input
                      name="location"
                      placeholder="Ciudad, país"
                      className={`${baseInput} max-w-md`}
                    />
                  </FormField>
                ) : null}

                {job.ask_for_salary_expectations ? (
                  <FormField label="Expectativa de salario (mensual)">
                    <div className="flex max-w-md gap-2">
                      <input
                        name="salary_expectation_amount"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder="0"
                        className={`${baseInput} flex-1`}
                      />
                      <select
                        name="salary_expectation_currency"
                        defaultValue={job.salary_currency ?? "MXN"}
                        className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm"
                      >
                        <option value="MXN">MXN</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                  </FormField>
                ) : null}

                {/* CV upload: the field is always shown so applicants
                    can attach one even when the job doesn't strictly
                    require it. Required hint flips based on the job's
                    `require_cv` toggle. */}
                <FormField
                  label={`CV${job.require_cv ? "" : " (opcional)"}`}
                  required={job.require_cv}
                >
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-bg-1 px-3 py-3 text-sm text-muted-foreground hover:bg-bg-2">
                    <Paperclip className="h-4 w-4" />
                    <span id="cv-filename">
                      {job.require_cv
                        ? "Adjunta tu CV (PDF o DOCX, máx 10 MB)"
                        : "Adjunta tu CV (opcional, máx 10 MB)"}
                    </span>
                    <input
                      name="cv"
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      required={job.require_cv}
                      className="hidden"
                      onChange={(e) => {
                        const span = document.getElementById("cv-filename");
                        if (span)
                          span.textContent =
                            e.target.files?.[0]?.name ??
                            (job.require_cv
                              ? "Adjunta tu CV (PDF o DOCX, máx 10 MB)"
                              : "Adjunta tu CV (opcional, máx 10 MB)");
                      }}
                    />
                  </label>
                </FormField>

                {screeningQuestions.length > 0 ? (
                  <div className="space-y-3 rounded-md border border-border bg-bg-1 p-4">
                    <h3 className="text-sm font-medium">
                      Preguntas adicionales
                    </h3>
                    {screeningQuestions.map((q) => (
                      <ScreeningInput key={q.id} question={q} />
                    ))}
                  </div>
                ) : null}

                {error ? (
                  <p className="rounded-md border border-danger-soft bg-danger-soft/40 px-3 py-2 text-xs text-danger">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                <Dialog.Close
                  className="rounded-md border border-border bg-bg-1 px-4 py-2 text-sm hover:bg-muted"
                  disabled={submitting}
                >
                  Cancelar
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-fg-on-accent hover:bg-accent/90 disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {submitting ? "Enviando…" : "Enviar aplicación"}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const baseInput =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-foreground">
        {label}
        {required ? <span className="ml-1 text-danger">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function ScreeningInput({ question }: { question: ScreeningQuestion }) {
  const name = `sq_${question.id}`;
  const required = Boolean(question.required);

  if (question.kind === "yes_no") {
    return (
      <FormField label={question.prompt} required={required}>
        <div className="flex gap-2">
          {["Sí", "No"].map((opt) => (
            <label
              key={opt}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-bg-1 px-3 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="radio"
                name={name}
                value={opt}
                required={required}
              />
              {opt}
            </label>
          ))}
        </div>
      </FormField>
    );
  }
  if (question.kind === "multi_choice") {
    const opts = question.options ?? [];
    return (
      <FormField label={question.prompt} required={required}>
        <Select
          // Uncontrolled-ish: hidden input mirrors the picked value
          // so FormData picks it up. Easier than re-architecting
          // Select to accept a name prop.
          value={""}
          onChange={(v) => {
            const hidden = document.getElementById(name) as HTMLInputElement | null;
            if (hidden) hidden.value = v;
          }}
          options={opts.map((o) => ({ value: o, label: o }))}
          placeholder="Selecciona una opción"
          className="max-w-md"
        />
        <input
          type="hidden"
          id={name}
          name={name}
          required={required}
        />
      </FormField>
    );
  }
  if (question.kind === "number") {
    return (
      <FormField label={question.prompt} required={required}>
        <input
          name={name}
          type="number"
          inputMode="numeric"
          required={required}
          className={`${baseInput} max-w-[200px]`}
        />
      </FormField>
    );
  }
  // short_text fallback
  return (
    <FormField label={question.prompt} required={required}>
      <input
        name={name}
        type="text"
        required={required}
        className={`${baseInput} max-w-md`}
      />
    </FormField>
  );
}
