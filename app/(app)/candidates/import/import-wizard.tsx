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
  suggestFieldFor,
  type CandidateField,
  type CsvRow,
  type FieldMapping,
} from "@/lib/csv-import";
import type { CandidateSource } from "@/lib/hiring";
import { importCandidatesAction } from "@/app/(app)/_actions/candidate-import";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";

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

function sourceOptions(
  t: TFunction,
): Array<{ value: CandidateSource; label: string }> {
  return [
    { value: "bulk_import", label: t("candidatesArea.sourceBulkImport") },
    { value: "linkedin", label: "LinkedIn" },
    { value: "indeed", label: "Indeed" },
    { value: "referral", label: t("candidatesArea.sourceReferral") },
    { value: "direct", label: t("candidatesArea.sourceDirect") },
    { value: "other", label: t("candidatesArea.sourceOther") },
  ];
}

const MAPPABLE_FIELDS = CANDIDATE_FIELDS.filter(
  (f): f is Exclude<CandidateField, "skip"> => f !== "skip",
);

type Step = "upload" | "map" | "confirm";

export function ImportWizard({
  jobId,
  stageId,
  initialSource,
}: {
  jobId?: string;
  stageId?: string;
  initialSource?: string;
}) {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const VALID_SOURCES: CandidateSource[] = [
    "linkedin",
    "indeed",
    "referral",
    "direct",
    "other",
    "bulk_import",
  ];
  const [defaultSource, setDefaultSource] = useState<CandidateSource>(
    initialSource && VALID_SOURCES.includes(initialSource as CandidateSource)
      ? (initialSource as CandidateSource)
      : "bulk_import",
  );
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
              t("candidatesArea.csvDelimiterError"),
            );
            return;
          }
        }
        const data = result.data.filter(
          (r) => r && Object.values(r).some((v) => v?.toString().trim()),
        );
        const hs = result.meta.fields ?? [];
        if (hs.length === 0 || data.length === 0) {
          setParseError(t("candidatesArea.csvEmpty"));
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
        jobId,
        stageId,
      });
      if (!res.ok) {
        toast.actionFailed(t("candidatesArea.importFailed"), res.error);
        return;
      }
      const s = res.data.summary;
      const dupTotal =
        s.skippedDuplicateEmail + (s.skippedDuplicateLinkedin ?? 0);
      const desc = [
        t("candidatesArea.summaryCreatedCsv", { count: s.created }),
        dupTotal > 0
          ? t("candidatesArea.summaryDuplicates", { count: dupTotal })
          : null,
        s.skippedNoName > 0
          ? t("candidatesArea.summaryNoName", { count: s.skippedNoName })
          : null,
        s.errors.length > 0
          ? t("candidatesArea.summaryWithError", { count: s.errors.length })
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      toast.actionOk(t("candidatesArea.importComplete"), desc);
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
  const t = useT();
  const steps: Array<{ id: Step; label: string }> = [
    { id: "upload", label: t("candidatesArea.csvStepUpload") },
    { id: "map", label: t("candidatesArea.csvStepMap") },
    { id: "confirm", label: t("candidatesArea.csvStepConfirm") },
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
  const t = useT();
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
            t("candidatesArea.dropCsv")
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("candidatesArea.dropCsvHint")}
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
  const t = useT();
  return (
    <div className="space-y-5">
      <div className="rounded-md bg-foreground/[0.04] px-3 py-2 text-xs text-muted-foreground">
        <FileText className="mr-1 inline h-3.5 w-3.5" />
        {fileName} ·{" "}
        <span className="font-mono">{totalRows.toLocaleString("es-MX")}</span>{" "}
        {t("candidatesArea.rowsDetected")}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">{t("candidatesArea.mapColumnsQuestion")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("candidatesArea.mapColumnsHintBefore")}{" "}
          <strong>{t("candidatesArea.fieldFullName")}</strong>{" "}
          {t("candidatesArea.mapColumnsHintAfter")}
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
        <h2 className="mb-2 text-sm font-medium">{t("candidatesArea.preview5Rows")}</h2>
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
          {t("candidatesArea.changeFile")}
        </Button>
        <Button onClick={onNext} disabled={!canContinue}>
          {t("candidatesArea.continue")}
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
  const t = useT();
  const required = field === "full_name";
  return (
    <>
      <dt className="text-xs">
        {t(`csvFields.${field}`)}
        {required ? <span className="text-danger"> *</span> : null}
      </dt>
      <dd>
        <Select
          value={value}
          onChange={onChange}
          className="max-w-md"
          placeholder={t("candidatesArea.doNotMap")}
          searchable={headers.length > 12}
          options={[
            { value: "", label: t("candidatesArea.doNotMap") },
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
  const t = useT();
  const mappedFields = MAPPABLE_FIELDS.filter((f) => mapping[f]);

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">{t("candidatesArea.summary")}</h2>
        <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("candidatesArea.rowsToProcess")}</dt>
          <dd className="font-mono">{totalRows.toLocaleString("es-MX")}</dd>
          <dt className="text-muted-foreground">{t("candidatesArea.mappedFields")}</dt>
          <dd>
            {mappedFields.map((f) => (
              <span
                key={f}
                className="mr-1.5 inline-block rounded bg-foreground/[0.06] px-1.5 py-0.5 text-xs"
              >
                {t(`csvFields.${f}`)}
              </span>
            ))}
          </dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("candidatesArea.confirmDedupNote")}
        </p>
      </div>

      {/* Source is picked once in the Add Candidates picker (host
          modal) before this wizard opens. We pass it through via
          `?source=` and rely on it here — no second prompt. */}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("candidatesArea.back")}
        </Button>
        <Button onClick={onSubmit} disabled={pending}>
          {pending
            ? t("candidatesArea.importing")
            : t("candidatesArea.importCount", {
                count: totalRows.toLocaleString("es-MX"),
              })}
        </Button>
      </div>
    </div>
  );
}
