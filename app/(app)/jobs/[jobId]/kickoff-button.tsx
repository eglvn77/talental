"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, Sparkles, Wand2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import type { KickoffRunEvent } from "@/lib/kickoff/run";
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
  roleConfig,
  missingRequiredCustomFields = [],
  hasContent,
}: {
  jobId: string;
  /**
   * The vacante's saved role configuration. `roleType` and
   * `assessmentLink` live on the row; everything else is read from
   * the workspace's `job` custom field values (with safe defaults
   * when the user hasn't set a value yet).
   *
   * If `roleType` is null the dialog blocks submit and points the
   * user back to Ajustes → Configuración del rol.
   */
  roleConfig: {
    roleType: RoleType | null;
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
   * don't yet have a value for this vacante. Surfaces a blocking
   * banner pointing the user back to Campos personalizados.
   */
  missingRequiredCustomFields?: Array<{
    id: string;
    key: string;
    label: string;
  }>;
  hasContent: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const runKind: KickoffRunKind = hasContent ? "calibration" : "kickoff";

  // Materialize the saved config as locals so the rest of the file
  // doesn't have to drill through `roleConfig.` everywhere. Fallbacks
  // mirror the previous in-dialog defaults so behaviour is identical
  // for any vacante whose row predates the columns.
  const roleType = roleConfig.roleType;
  const jdLanguage = roleConfig.jdLanguage;
  const outreachLanguage = roleConfig.outreachLanguage;
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
  const [tokenChars, setTokenChars] = useState(0);

  // While "generating" is active, cycle role-specific subtitles so the
  // user sees variety beyond the static phase label. Pure UX texture —
  // the truth comes from the server events.
  const subtitles = useMemo(
    () => progressMessagesFor(roleType ?? "full_headhunting"),
    [roleType],
  );
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  useEffect(() => {
    if (phaseMessage !== "Generando con Claude…") return;
    setSubtitleIndex(0);
    const id = setInterval(() => {
      setSubtitleIndex((i) => (i + 1) % subtitles.length);
    }, 6000);
    return () => clearInterval(id);
  }, [phaseMessage, subtitles.length]);

  const isAiRole =
    roleType === "hybrid_ai_hunting" || roleType === "inbound_ai_driven";

  function onSubmit() {
    if (roleType === null) {
      setError(
        "Configura el Tipo de rol en Ajustes → Configuración del rol primero.",
      );
      return;
    }
    if (missingRequiredCustomFields.length > 0) {
      setError(
        `Faltan campos obligatorios: ${missingRequiredCustomFields
          .map((f) => f.label)
          .join(", ")}. Configúralos en Ajustes → Campos personalizados.`,
      );
      return;
    }
    // Either textarea OR at least one PDF must provide content.
    if (!materialsText.trim() && pdfFiles.length === 0) {
      setError(
        runKind === "kickoff"
          ? "Pega los materiales o adjunta un PDF (transcripción, JD, notas)."
          : "Pega al menos un contexto o adjunta un PDF para calibrar.",
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
    if (roleType === null) return; // Guarded by onSubmit; double-check.
    setError(null);
    setPhaseMessage("Conectando…");
    setTokenChars(0);
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
        const payload = { jobId, materials, setupAnswers, runKind };
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
        setError("La conexión se cerró sin completar la generación.");
        return;
      }
      if (finalEvent.type === "error") {
        setError(finalEvent.error);
        return;
      }
      const conflicts = finalEvent.conflicts;
      const description =
        conflicts.length > 0
          ? `${conflicts.length} contradicción${conflicts.length === 1 ? "" : "es"} resuelta${conflicts.length === 1 ? "" : "s"} entre intake y JD.`
          : undefined;
      toast.actionOk(
        runKind === "kickoff" ? "Vacante generada" : "Calibración aplicada",
        description,
      );
      setOpen(false);
      router.push(`/jobs/${jobId}/overview`);
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
        onClick={() => setOpen(true)}
        variant="ghost"
        aria-label={hasContent ? "Calibrar" : "Kickoff"}
        title={hasContent ? "Calibrar" : "Kickoff"}
        className="btn-ai inline-flex h-9 w-9 items-center justify-center p-0"
      >
        {hasContent ? (
          <Wand2 className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
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
            {roleType === null ? (
              <div className="rounded-md border border-warning-soft bg-warning-soft/40 px-3 py-2 text-xs text-warning">
                Configura el <strong>Tipo de rol</strong> en{" "}
                <a
                  href={`/jobs/${jobId}/settings`}
                  className="underline hover:opacity-80"
                >
                  Ajustes → Configuración del rol
                </a>{" "}
                antes de correr Kickoff / Calibrar.
              </div>
            ) : null}

            {missingRequiredCustomFields.length > 0 ? (
              <div className="rounded-md border border-warning-soft bg-warning-soft/40 px-3 py-2 text-xs text-warning">
                Faltan campos obligatorios:{" "}
                <strong>
                  {missingRequiredCustomFields
                    .map((f) => f.label)
                    .join(", ")}
                </strong>
                . Llénalos en{" "}
                <a
                  href={`/jobs/${jobId}/settings`}
                  className="underline hover:opacity-80"
                >
                  Ajustes → Campos personalizados
                </a>{" "}
                antes de correr.
              </div>
            ) : null}

            <Section title="Materiales">
              <Field label="Materiales" required>
                <div className="space-y-2">
                  <textarea
                    value={materialsText}
                    onChange={(e) => setMaterialsText(e.target.value)}
                    rows={14}
                    disabled={pending}
                    placeholder={
                      runKind === "kickoff"
                        ? "Pega aquí todo lo que tengas: transcripción del intake call, JD de la empresa, notas internas, links. O adjunta PDFs abajo. Cuanto más contexto, mejor."
                        : "Pega transcripción del debrief, feedback de la empresa, JD actualizado, notas — lo que tengas. O adjunta PDFs."
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
                      Adjuntar PDF
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
                          aria-label={`Quitar ${f.name}`}
                          className="rounded text-muted-foreground hover:text-danger"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {pdfFiles.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">
                        Hasta 3 archivos, 10 MB cada uno
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
                    {phaseMessage ?? "Conectando…"}
                    {phaseMessage === "Generando con Claude…" && tokenChars > 0
                      ? ` · ${Math.round(tokenChars / 100) / 10}k chars`
                      : null}
                  </span>
                  {phaseMessage === "Generando con Claude…" ? (
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

      <ConfirmDialog
        open={calibrationConfirm}
        onOpenChange={setCalibrationConfirm}
        title="Aplicar calibración"
        description="Esto regenera todo el contenido de los tabs y crea entradas nuevas en outreach y checklist. ¿Continuar?"
        confirmLabel="Calibrar"
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

