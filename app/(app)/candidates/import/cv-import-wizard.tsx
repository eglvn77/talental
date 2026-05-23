"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import type { ParsedCv } from "@/lib/cv-parser/types";
import { CvReviewCards, type CvCard } from "./cv-review-cards";

/**
 * Drag-drop CV import wizard. Steps:
 *   1. Upload — drop or pick up to 10 PDFs.
 *   2. Parse  — fire concurrent /api/candidates/parse-cv requests,
 *               max 3 in flight at once. Per-file state shown live.
 *   3. Review — (COMMIT 3) edit cards + dedup picker.
 *   4. Save   — (COMMIT 4) hit /api/candidates/bulk-create.
 *
 * This commit lands steps 1-2 only; step 3 renders a placeholder
 * with "Pendiente — siguiente commit" so the wiring is testable.
 */

const MAX_FILES = 10;
const MAX_CONCURRENT = 3;
const MAX_BYTES_PER_FILE = 15 * 1024 * 1024;

type FileEntry = {
  /** Stable per-mount id so React keys survive reorder/remove. */
  id: string;
  file: File;
  status: "pending" | "parsing" | "success" | "error";
  parsed?: ParsedCv;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd_estimated: number;
    attempts: number;
  };
  error?: string;
};

type WizardStep = "upload" | "review";

export function CvImportWizard() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [step, setStep] = useState<WizardStep>("upload");
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allDone = useMemo(
    () =>
      files.length > 0 &&
      files.every((f) => f.status === "success" || f.status === "error"),
    [files],
  );
  const successCount = useMemo(
    () => files.filter((f) => f.status === "success").length,
    [files],
  );
  const totalCost = useMemo(
    () =>
      files.reduce((acc, f) => acc + (f.usage?.cost_usd_estimated ?? 0), 0),
    [files],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      setFiles((prev) => {
        const slotsLeft = MAX_FILES - prev.length;
        if (slotsLeft <= 0) {
          toast.actionFailed(`Máximo ${MAX_FILES} archivos por batch.`);
          return prev;
        }
        const filtered: FileEntry[] = [];
        for (const file of incoming.slice(0, slotsLeft)) {
          if (file.size > MAX_BYTES_PER_FILE) {
            toast.actionFailed(
              `${file.name} excede 15 MB — saltado.`,
            );
            continue;
          }
          const lower = file.name.toLowerCase();
          if (!lower.endsWith(".pdf")) {
            toast.actionFailed(
              `${file.name} no es PDF — saltado (DOCX viene después).`,
            );
            continue;
          }
          filtered.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            status: "pending",
          });
        }
        return [...prev, ...filtered];
      });
    },
    [],
  );

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAll() {
    if (parsing) return;
    setFiles([]);
  }

  async function startParsing() {
    if (parsing || files.length === 0) return;
    setParsing(true);

    // Snapshot the queue at click time. We disable the drop zone
    // while parsing, so the file objects we capture here are stable
    // for the duration of the run.
    const queue = files
      .filter((f) => f.status === "pending" || f.status === "error")
      .map((f) => ({ id: f.id, file: f.file }));
    let nextIdx = 0;

    async function parseOne(id: string, file: File) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, status: "parsing", error: undefined } : f,
        ),
      );
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/candidates/parse-cv", {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  status: "success",
                  parsed: json.parsed,
                  usage: json.usage,
                  error: undefined,
                }
              : f,
          ),
        );
      } catch (e) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  status: "error",
                  error: e instanceof Error ? e.message.slice(0, 200) : String(e),
                }
              : f,
          ),
        );
      }
    }

    async function worker() {
      while (true) {
        const myIdx = nextIdx++;
        const item = queue[myIdx];
        if (!item) return;
        await parseOne(item.id, item.file);
      }
    }

    // Spawn N workers; they consume the shared queue.
    await Promise.all(
      Array.from({ length: MAX_CONCURRENT }, () => worker()),
    );

    setParsing(false);
  }

  function goToReview() {
    if (successCount === 0) {
      toast.actionFailed(
        "Ningún CV se parseó correctamente. Revisa los errores y reintenta.",
      );
      return;
    }
    setStep("review");
  }

  return (
    <div className="space-y-5">
      <Steps current={step} />

      {step === "upload" ? (
        <>
          <DropZone
            onFiles={addFiles}
            disabled={parsing}
            count={files.length}
            inputRef={fileInputRef}
          />

          {files.length > 0 ? (
            <FileList
              files={files}
              onRemove={removeFile}
              disabled={parsing}
            />
          ) : null}

          <FooterBar
            files={files}
            parsing={parsing}
            allDone={allDone}
            successCount={successCount}
            totalCost={totalCost}
            onClear={clearAll}
            onParse={startParsing}
            onReview={goToReview}
          />
        </>
      ) : null}

      {step === "review" ? (
        <CvReviewCards
          initial={buildCardsFromFiles(files)}
          onBack={() => setStep("upload")}
          onSave={(cards) => {
            // COMMIT 4 wires this to /api/candidates/bulk-create.
            // Stash on a stub for now so this commit is reviewable
            // without the persistence path.
            console.log("[cv-import] save (commit 4 wires this):", cards);
            toast.info(
              "Guardar conectado en el siguiente commit",
              `${cards.length} tarjeta${cards.length === 1 ? "" : "s"} listas.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

/** Project the successfully-parsed files into card state. */
function buildCardsFromFiles(files: FileEntry[]): CvCard[] {
  return files
    .filter((f) => f.status === "success" && f.parsed)
    .map((f) => ({
      id: f.id,
      file_name: f.file.name,
      parsed: f.parsed!,
      action: "create" as const,
    }));
}

// =========================================================
// Drop zone
// =========================================================

function DropZone({
  onFiles,
  disabled,
  count,
  inputRef,
}: {
  onFiles: (files: File[]) => void;
  disabled: boolean;
  count: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [hover, setHover] = useState(false);
  const slotsLeft = MAX_FILES - count;
  return (
    <label
      htmlFor="cv-files"
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        if (disabled) return;
        const dropped = Array.from(e.dataTransfer.files ?? []);
        onFiles(dropped);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-foreground/15 bg-card px-6 py-10 text-center transition-colors hover:bg-foreground/[0.04]",
        hover && "border-accent bg-accent/5",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <Upload className="h-6 w-6 text-foreground/40" aria-hidden />
      <p className="text-sm">
        Arrastra CVs aquí o haz clic para seleccionar
      </p>
      <p className="text-xs text-muted-foreground">
        Hasta {MAX_FILES} archivos PDF · max 15 MB cada uno
        {count > 0 ? ` · ${slotsLeft} espacios restantes` : ""}
      </p>
      <input
        id="cv-files"
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          onFiles(list);
          // Reset so re-picking the same file works.
          if (inputRef.current) inputRef.current.value = "";
        }}
        disabled={disabled}
      />
    </label>
  );
}

// =========================================================
// File list with per-file status
// =========================================================

function FileList({
  files,
  onRemove,
  disabled,
}: {
  files: FileEntry[];
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <ul className="space-y-1.5">
      {files.map((f) => (
        <li
          key={f.id}
          className={cn(
            "flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2",
            f.status === "error" && "border-danger-soft",
          )}
        >
          <StatusIcon status={f.status} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{f.file.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {(f.file.size / 1024).toLocaleString("es-MX", {
                maximumFractionDigits: 0,
              })}{" "}
              KB
              {f.usage
                ? ` · $${f.usage.cost_usd_estimated.toFixed(4)} · ${f.usage.attempts} intento${f.usage.attempts === 1 ? "" : "s"}`
                : ""}
              {f.status === "success" && f.parsed?.full_name
                ? ` · ${f.parsed.full_name}`
                : ""}
              {f.status === "error" && f.error ? ` · ${f.error}` : ""}
            </div>
          </div>
          {f.status === "pending" || f.status === "error" ? (
            <button
              type="button"
              onClick={() => onRemove(f.id)}
              disabled={disabled}
              aria-label="Quitar"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function StatusIcon({ status }: { status: FileEntry["status"] }) {
  if (status === "parsing") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />;
  }
  if (status === "success") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />;
  }
  if (status === "error") {
    return <AlertCircle className="h-4 w-4 shrink-0 text-danger" />;
  }
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

// =========================================================
// Footer / actions
// =========================================================

function FooterBar({
  files,
  parsing,
  allDone,
  successCount,
  totalCost,
  onClear,
  onParse,
  onReview,
}: {
  files: FileEntry[];
  parsing: boolean;
  allDone: boolean;
  successCount: number;
  totalCost: number;
  onClear: () => void;
  onParse: () => void;
  onReview: () => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
      <span className="text-muted-foreground">
        {parsing
          ? `Parseando… ${files.filter((f) => f.status === "parsing").length} en curso, ${files.filter((f) => f.status === "pending").length} pendientes`
          : allDone
            ? `${successCount} de ${files.length} parseados · ~$${totalCost.toFixed(4)} en Gemini`
            : `${files.length} archivo${files.length === 1 ? "" : "s"} listo${files.length === 1 ? "" : "s"} para parsear`}
      </span>
      <div className="flex gap-2">
        {!parsing && !allDone ? (
          <Button variant="ghost" onClick={onClear}>
            Limpiar
          </Button>
        ) : null}
        {!allDone ? (
          <Button onClick={onParse} disabled={parsing}>
            {parsing
              ? `Parseando…`
              : `Parsear ${files.length} CV${files.length === 1 ? "" : "s"}`}
          </Button>
        ) : (
          <Button onClick={onReview} disabled={successCount === 0}>
            Revisar {successCount} candidato{successCount === 1 ? "" : "s"}
          </Button>
        )}
      </div>
    </div>
  );
}

// =========================================================
// Steps indicator
// =========================================================

function Steps({ current }: { current: WizardStep }) {
  const steps: Array<{ id: WizardStep; label: string }> = [
    { id: "upload", label: "1. Subir y parsear" },
    { id: "review", label: "2. Revisar y guardar" },
  ];
  return (
    <ol className="flex items-center gap-3 text-xs">
      {steps.map((s) => {
        const isCurrent = s.id === current;
        return (
          <li
            key={s.id}
            className={cn(
              "rounded-full px-3 py-1",
              isCurrent
                ? "bg-foreground/[0.07] font-medium text-foreground"
                : "text-foreground/40",
            )}
          >
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

