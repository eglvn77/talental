"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
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
  const t = useT();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  // CV parsing state. When the candidate selects a PDF we kick off a
  // best-effort parse and auto-fill any of these four fields that
  // are still empty. The candidate can edit anything we filled —
  // we never overwrite values they already typed.
  const [parsing, setParsing] = useState(false);
  const [autofilled, setAutofilled] = useState<Set<string>>(new Set());
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const linkedinRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);

  const screeningQuestions =
    (job.screening_questions as ScreeningQuestion[] | null) ?? [];

  async function tryParseCv(file: File) {
    setParsing(true);
    try {
      const fd = new FormData();
      fd.set("cv", file);
      const res = await fetch("/api/careers/parse-cv", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) return; // Soft failure — candidate fills manually.
      const json = (await res.json()) as {
        ok: boolean;
        data?: {
          full_name: string | null;
          email: string | null;
          phone: string | null;
          location: string | null;
          linkedin_url: string | null;
        };
      };
      if (!json.ok || !json.data) return;
      const filled = new Set<string>();
      const fills: Array<[
        React.RefObject<HTMLInputElement | null>,
        string | null,
        string,
      ]> = [
        [nameRef, json.data.full_name, "full_name"],
        [emailRef, json.data.email, "email"],
        [phoneRef, json.data.phone, "phone"],
        [locationRef, json.data.location, "location"],
        [linkedinRef, json.data.linkedin_url, "linkedin_url"],
      ];
      for (const [ref, value, key] of fills) {
        if (!value) continue;
        const input = ref.current;
        if (!input) continue;
        // Only fill empties — never clobber what the candidate
        // already typed (they might have edited before the parse
        // settled, since this whole thing runs async after upload).
        if (input.value.trim()) continue;
        input.value = value;
        filled.add(key);
      }
      setAutofilled(filled);
    } catch {
      // Network or parse failure — silent fallback to manual entry.
    } finally {
      setParsing(false);
    }
  }

  function clearAutofillFlag(key: string) {
    setAutofilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

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
    // Pass the ?src tracking token from the careers URL so the apply
    // route can auto-attribute the candidate's Source/Origen.
    const src =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("src")
        : null;
    if (src) fd.set("src", src);

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
      setError(t("careers.submitError"));
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
              {t("careers.applyToTitle", { title: job.title })}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("careers.close")}
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
                  ? t("careers.successDuplicateTitle")
                  : t("careers.successTitle")}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {duplicate
                  ? t("careers.successDuplicateBody")
                  : t("careers.successBody")}
              </p>
              <Dialog.Close className="mt-2 rounded-md border border-border bg-bg-1 px-4 py-2 text-sm hover:bg-muted">
                {t("careers.close")}
              </Dialog.Close>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {/* CV upload sits at the top so the candidate adjuntando
                    triggers the autofill parse before they start
                    typing the rest of the fields. Mandatory on every
                    careers application — the recruiter needs the
                    document to do a real review. */}
                <FormField label={t("careers.cv")} required>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-bg-1 px-3 py-3 text-sm text-muted-foreground hover:bg-bg-2">
                    {parsing ? (
                      <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                    <span id="cv-filename">
                      {parsing
                        ? t("careers.cvReading")
                        : t("careers.cvAttach")}
                    </span>
                    <input
                      name="cv"
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      required
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        const span = document.getElementById("cv-filename");
                        if (span)
                          span.textContent =
                            file?.name ?? t("careers.cvAttach");
                        // Fire the parse in the background. It won't
                        // block the candidate from continuing to fill
                        // the form — if it finishes before they type,
                        // we auto-fill the empties; if not, they fill
                        // by hand and the parse result is ignored.
                        // Server accepts PDF + DOCX; we mirror that
                        // gate here so an old .doc upload doesn't
                        // trigger a doomed parse request.
                        if (file) {
                          const lower = file.name.toLowerCase();
                          const isParseable =
                            file.type.includes("pdf") ||
                            lower.endsWith(".pdf") ||
                            file.type.includes(
                              "officedocument.wordprocessing",
                            ) ||
                            lower.endsWith(".docx");
                          if (isParseable) void tryParseCv(file);
                        }
                      }}
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("careers.cvAutofillHint")}
                  </p>
                </FormField>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    label={t("careers.fullName")}
                    required
                    autofilled={autofilled.has("full_name")}
                  >
                    <input
                      ref={nameRef}
                      name="full_name"
                      required
                      autoComplete="name"
                      onChange={() => clearAutofillFlag("full_name")}
                      className={baseInput}
                    />
                  </FormField>
                  <FormField
                    label={t("careers.email")}
                    required
                    autofilled={autofilled.has("email")}
                  >
                    <input
                      ref={emailRef}
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      onChange={() => clearAutofillFlag("email")}
                      className={baseInput}
                    />
                  </FormField>
                </div>

                <FormField
                  label={t("careers.phone")}
                  required
                  autofilled={autofilled.has("phone")}
                >
                  <input
                    ref={phoneRef}
                    name="phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    onChange={() => clearAutofillFlag("phone")}
                    className={`${baseInput} max-w-md`}
                  />
                </FormField>

                <FormField
                  label="LinkedIn"
                  autofilled={autofilled.has("linkedin_url")}
                >
                  <input
                    ref={linkedinRef}
                    name="linkedin_url"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://linkedin.com/in/tu-perfil"
                    onChange={() => clearAutofillFlag("linkedin_url")}
                    className={`${baseInput} max-w-md`}
                  />
                </FormField>

                {job.ask_for_location ? (
                  <FormField
                    label={t("careers.locationLabel")}
                    autofilled={autofilled.has("location")}
                  >
                    <input
                      ref={locationRef}
                      name="location"
                      placeholder={t("careers.locationPlaceholder")}
                      onChange={() => clearAutofillFlag("location")}
                      className={`${baseInput} max-w-md`}
                    />
                  </FormField>
                ) : null}

                {job.ask_for_salary_expectations ? (
                  <FormField label={t("careers.salaryExpectation")}>
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

                {screeningQuestions.length > 0 ? (
                  <div className="space-y-3 rounded-md border border-border bg-bg-1 p-4">
                    <h3 className="text-sm font-medium">
                      {t("careers.additionalQuestions")}
                    </h3>
                    {screeningQuestions.map((q) => (
                      <ScreeningInput key={q.id} question={q} t={t} />
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
                  {t("careers.cancel")}
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-fg-on-accent hover:bg-accent/90 disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {submitting ? t("careers.submitting") : t("careers.submit")}
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
  autofilled,
  children,
}: {
  label: string;
  required?: boolean;
  /** When true, shows a small "Detectado del CV" chip next to the
   *  label. The parent clears this flag once the candidate edits
   *  the value, so the chip doesn't lie. */
  autofilled?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-2 text-xs font-medium text-foreground">
        {label}
        {required ? <span className="text-danger">*</span> : null}
        {autofilled ? (
          <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-normal text-accent">
            <Sparkles className="h-2.5 w-2.5" />
            {t("careers.detectedFromCv")}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function ScreeningInput({
  question,
  t,
}: {
  question: ScreeningQuestion;
  t: TFunction;
}) {
  const name = `sq_${question.id}`;
  const required = Boolean(question.required);

  if (question.kind === "yes_no") {
    // `value` stays the canonical Spanish so the stored answer is
    // locale-stable; only the visible label is translated.
    const yesNo: Array<{ value: string; label: string }> = [
      { value: "Sí", label: t("careers.yes") },
      { value: "No", label: t("careers.no") },
    ];
    return (
      <FormField label={question.prompt} required={required}>
        <div className="flex gap-2">
          {yesNo.map((opt) => (
            <label
              key={opt.value}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-bg-1 px-3 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                required={required}
              />
              {opt.label}
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
          placeholder={t("careers.selectOption")}
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
