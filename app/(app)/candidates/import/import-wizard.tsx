"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { ArrowLeft, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  CANDIDATE_FIELDS,
  FIELD_LABELS,
  suggestFieldFor,
  type CandidateField,
  type CsvRow,
  type FieldMapping,
} from "@/lib/csv-import";
import type { CandidateSource } from "@/lib/hiring";
import { importCandidatesAction } from "@/app/(app)/_actions/candidate-import";

/**
 * Three-step wizard for bulk-importing candidates from CSV.
 *
 *   1. Upload  — drop or pick a CSV file. Parsed entirely in the browser
 *                with papaparse so we never POST raw files to the server.
 *   2. Map     — for each candidate field, pick which CSV column maps
 *                to it. Auto-suggested from header names.
 *   3. Confirm — pick a default source, review counts, hit Importar.
 *
 * The server action receives the parsed rows + mapping + source via JSON.
 * It handles dedup by email (workspace-scoped) and batched insert. For
 * 12k rows the round-trip can be 10-30s — we accept that for v1; future
 * pass can chunk client-side and report progress.
 */

const SOURCE_OPTIONS: Array<{ value: CandidateSource; label: string }> = [
  { value: "bulk_import", label: "Importado" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "referral", label: "Referencia" },
  { value: "direct", label: "Directo" },
  { value: "other", label: "Otro" },
];

const MAPPABLE_FIELDS = CANDIDATE_FIELDS.filter(
  (f): f is Exclude<CandidateField, "skip"> => f !== "skip",
);

type Step = "upload" | "map" | "confirm";

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [defaultSource, setDefaultSource] = useState<CandidateSource>("bulk_import");
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    setParseError(null);
    setFileName(file.name);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        if (result.errors.length > 0) {
          // Soft-tolerant: keep going if at least some rows parsed.
          const fatal = result.errors.find(
            (e) => e.type === "Delimiter" || e.code === "UndetectableDelimiter",
          );
          if (fatal) {
            setParseError(
              `No pude detectar el delimitador. Asegúrate que sea CSV (separado por comas).`,
            );
            return;
          }
        }
        const data = result.data.filter(
          (r) => r && Object.values(r).some((v) => v?.toString().trim()),
        );
        const hs = result.meta.fields ?? [];
        if (hs.length === 0 || data.length === 0) {
          setParseError("El archivo parece estar vacío.");
          return;
        }
        setHeaders(hs);
        setRows(data);
        // Pre-fill the mapping from header heuristics.
        const initial: FieldMapping = {};
        for (const h of hs) {
          const field = suggestFieldFor(h);
          if (field === "skip") continue;
          if (initial[field]) continue; // first match wins
          initial[field] = h;
        }
        setMapping(initial);
        setStep("map");
      },
      error: (err) => {
        setParseError(err.message);
      },
    });
  }

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);
  const canConfirm = Boolean(mapping.full_name);

  function setMappingFor(field: Exclude<CandidateField, "skip">, header: string) {
    setMapping((m) => ({
      ...m,
      [field]: header === "" ? null : header,
    }));
  }

  function submit() {
    startTransition(async () => {
      const res = await importCandidatesAction({
        rows,
        mapping,
        defaultSource,
      });
      if (!res.ok) {
        toast.actionFailed("No se pudo importar", res.error);
        return;
      }
      const s = res.data.summary;
      const desc = [
        `${s.created} creados`,
        s.skippedDuplicateEmail > 0
          ? `${s.skippedDuplicateEmail} duplicados`
          : null,
        s.skippedNoName > 0 ? `${s.skippedNoName} sin nombre` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      toast.actionOk("Import completado", desc);
      router.push("/candidates");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Steps current={step} />

      {step === "upload" ? (
        <UploadStep
          onFile={handleFile}
          error={parseError}
          fileName={fileName}
        />
      ) : null}

      {step === "map" ? (
        <MapStep
          headers={headers}
          previewRows={previewRows}
          mapping={mapping}
          onChange={setMappingFor}
          totalRows={rows.length}
          fileName={fileName}
          onBack={() => setStep("upload")}
          onNext={() => setStep("confirm")}
          canContinue={canConfirm}
        />
      ) : null}

      {step === "confirm" ? (
        <ConfirmStep
          totalRows={rows.length}
          mapping={mapping}
          defaultSource={defaultSource}
          onSourceChange={setDefaultSource}
          onBack={() => setStep("map")}
          onSubmit={submit}
          pending={pending}
        />
      ) : null}
    </div>
  );
}

// =========================================================
// Step indicator
// =========================================================

function Steps({ current }: { current: Step }) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: "upload", label: "1. Subir archivo" },
    { id: "map", label: "2. Mapear columnas" },
    { id: "confirm", label: "3. Confirmar" },
  ];
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-3 text-xs">
      {steps.map((s, i) => {
        const isCurrent = s.id === current;
        const isPast = i < currentIdx;
        return (
          <li
            key={s.id}
            className={cn(
              "rounded-full px-3 py-1",
              isCurrent
                ? "bg-foreground/[0.07] font-medium text-foreground"
                : isPast
                  ? "text-foreground/60"
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

// =========================================================
// Step 1 — Upload
// =========================================================

function UploadStep({
  onFile,
  error,
  fileName,
}: {
  onFile: (file: File) => void;
  error: string | null;
  fileName: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="space-y-3">
      <label
        htmlFor="csv-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-foreground/15 bg-card px-6 py-12 text-center transition-colors hover:bg-foreground/[0.04]",
          dragOver && "border-accent bg-accent/5",
        )}
      >
        <Upload className="h-6 w-6 text-foreground/40" aria-hidden />
        <p className="text-sm">
          {fileName ? (
            <>
              <FileText className="mr-1 inline h-3.5 w-3.5" />
              {fileName}
            </>
          ) : (
            "Arrastra un CSV aquí o clic para elegir"
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          CSV separado por comas. Primera fila debe ser de encabezados.
          Máximo 15,000 filas.
        </p>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </label>
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
  );
}

// =========================================================
// Step 2 — Map
// =========================================================

function MapStep({
  headers,
  previewRows,
  mapping,
  onChange,
  totalRows,
  fileName,
  onBack,
  onNext,
  canContinue,
}: {
  headers: string[];
  previewRows: CsvRow[];
  mapping: FieldMapping;
  onChange: (field: Exclude<CandidateField, "skip">, header: string) => void;
  totalRows: number;
  fileName: string | null;
  onBack: () => void;
  onNext: () => void;
  canContinue: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-md bg-foreground/[0.04] px-3 py-2 text-xs text-muted-foreground">
        <FileText className="mr-1 inline h-3.5 w-3.5" />
        {fileName} ·{" "}
        <span className="font-mono">{totalRows.toLocaleString("es-MX")}</span>{" "}
        filas detectadas
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">¿Qué columna mapea a qué campo?</h2>
        <p className="text-xs text-muted-foreground">
          Pre-cargamos sugerencias basadas en los encabezados. Ajusta lo que
          haga falta. Solo <strong>Nombre completo</strong> es obligatorio.
        </p>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr] sm:items-center">
          {MAPPABLE_FIELDS.map((field) => (
            <FieldMapRow
              key={field}
              field={field}
              headers={headers}
              value={mapping[field] ?? ""}
              onChange={(v) => onChange(field, v)}
            />
          ))}
        </dl>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">Vista previa (5 filas)</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left font-medium text-muted-foreground">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-2 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {previewRows.map((r, i) => (
                <tr key={i}>
                  {headers.map((h) => (
                    <td key={h} className="px-2 py-1.5 text-foreground/70">
                      {String(r[h] ?? "").slice(0, 80)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Cambiar archivo
        </Button>
        <Button onClick={onNext} disabled={!canContinue}>
          Continuar
        </Button>
      </div>
    </div>
  );
}

function FieldMapRow({
  field,
  headers,
  value,
  onChange,
}: {
  field: Exclude<CandidateField, "skip">;
  headers: string[];
  value: string;
  onChange: (header: string) => void;
}) {
  const required = field === "full_name";
  return (
    <>
      <dt className="text-xs">
        {FIELD_LABELS[field]}
        {required ? <span className="text-danger"> *</span> : null}
      </dt>
      <dd>
        <Select
          value={value}
          onChange={onChange}
          className="max-w-md"
          placeholder="— No mapear —"
          searchable={headers.length > 12}
          options={[
            { value: "", label: "— No mapear —" },
            ...headers.map((h) => ({ value: h, label: h })),
          ]}
        />
      </dd>
    </>
  );
}

// =========================================================
// Step 3 — Confirm
// =========================================================

function ConfirmStep({
  totalRows,
  mapping,
  defaultSource,
  onSourceChange,
  onBack,
  onSubmit,
  pending,
}: {
  totalRows: number;
  mapping: FieldMapping;
  defaultSource: CandidateSource;
  onSourceChange: (s: CandidateSource) => void;
  onBack: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const mappedFields = MAPPABLE_FIELDS.filter((f) => mapping[f]);

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">Resumen</h2>
        <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Filas a procesar</dt>
          <dd className="font-mono">{totalRows.toLocaleString("es-MX")}</dd>
          <dt className="text-muted-foreground">Campos mapeados</dt>
          <dd>
            {mappedFields.map((f) => (
              <span
                key={f}
                className="mr-1.5 inline-block rounded bg-foreground/[0.06] px-1.5 py-0.5 text-xs"
              >
                {FIELD_LABELS[f]}
              </span>
            ))}
          </dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Los candidatos con email que ya existan en este workspace se
          omiten automáticamente. Los que no tengan nombre se omiten.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="default-source" className="text-sm font-medium">
          Origen por defecto
        </label>
        <p className="text-xs text-muted-foreground">
          Se asigna a todos los candidatos de este import.
        </p>
        <Select
          value={defaultSource}
          onChange={(v) => onSourceChange(v as CandidateSource)}
          className="max-w-xs"
          options={SOURCE_OPTIONS.map((s) => ({
            value: s.value,
            label: s.label,
          }))}
        />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Atrás
        </Button>
        <Button onClick={onSubmit} disabled={pending}>
          {pending ? "Importando…" : `Importar ${totalRows.toLocaleString("es-MX")} candidatos`}
        </Button>
      </div>
    </div>
  );
}
