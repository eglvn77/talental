"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X, FileText, CheckCircle2, AlertCircle, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BULK_MAX_FILES,
  BULK_MAX_FILE_BYTES,
  type BulkCommitDecision,
  type BulkConflictGroup,
  type BulkFailedItem,
  type BulkParseItem,
  type BulkParseResult,
  type ResolvedScalarFields,
} from "@/lib/cv-batch";
import { bulkParseCVsAction, commitBulkCVsAction } from "../../actions";

type Phase = "idle" | "parsing" | "review" | "committing" | "done";

type ResolutionState = Record<
  string,
  {
    // Per scalar field, which source's value to use ("temp:<tempId>" or "existing")
    fieldChoices: Record<keyof ResolvedScalarFields, string>;
    // Which item's PDF to keep (for intra-batch merges)
    primaryTempId: string;
    // Skip this conflict entirely (discard all CVs in it)
    discard: boolean;
  }
>;

const SCALAR_FIELDS: Array<keyof ResolvedScalarFields> = [
  "full_name",
  "email",
  "phone",
  "linkedin_url",
  "location",
  "current_title",
  "current_company",
  "summary",
];

const FIELD_LABEL: Record<keyof ResolvedScalarFields, string> = {
  full_name: "Nombre",
  email: "Email",
  phone: "Teléfono",
  linkedin_url: "LinkedIn",
  location: "Ubicación",
  current_title: "Puesto actual",
  current_company: "Empresa actual",
  summary: "Resumen",
};

/**
 * @deprecated Use <AddCandidateMenu> which mounts BulkUploadDialog inline.
 * Kept exported temporarily in case any other surface references it.
 */
export function BulkUploadButton({ jobId }: { jobId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Upload className="h-4 w-4" />
        Bulk upload
      </Button>
      {open ? (
        <BulkUploadDialog jobId={jobId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function BulkUploadDialog({
  jobId,
  onClose,
}: {
  /** Omit for talent-pool mode (candidates created without applications). */
  jobId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [parseResult, setParseResult] = useState<BulkParseResult | null>(null);
  const [resolutions, setResolutions] = useState<ResolutionState>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(picked: FileList | File[]) {
    setError(null);
    const next = [...files];
    const incoming = Array.from(picked);
    for (const f of incoming) {
      if (next.length >= BULK_MAX_FILES) {
        setError(`Máximo ${BULK_MAX_FILES} archivos. Algunos no se agregaron.`);
        break;
      }
      const isPdf =
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setError(`${f.name} no es PDF`);
        continue;
      }
      if (f.size > BULK_MAX_FILE_BYTES) {
        setError(
          `${f.name} excede ${Math.round(BULK_MAX_FILE_BYTES / 1024 / 1024)} MB`,
        );
        continue;
      }
      // Skip if already in the list (by name + size).
      const dup = next.find((x) => x.name === f.name && x.size === f.size);
      if (dup) continue;
      next.push(f);
    }
    setFiles(next);
  }

  function removeFile(idx: number) {
    setFiles(files.filter((_, i) => i !== idx));
  }

  function onParse() {
    if (files.length === 0) return;
    setError(null);
    setPhase("parsing");
    const fd = new FormData();
    for (const f of files) fd.append("cvs", f);
    startTransition(async () => {
      const res = await bulkParseCVsAction(fd);
      if (!res.ok) {
        setError(res.error);
        setPhase("idle");
        return;
      }
      setParseResult(res.data);
      // Initialize resolution state for each conflict group.
      const init: ResolutionState = {};
      for (const group of res.data.conflicts) {
        const choices: Record<keyof ResolvedScalarFields, string> =
          {} as Record<keyof ResolvedScalarFields, string>;
        for (const f of SCALAR_FIELDS) {
          // Default: first item's value, or existing's if it has one.
          if (group.existing) {
            const existingVal = readScalar(group.existing, f);
            if (existingVal) {
              choices[f] = "existing";
              continue;
            }
          }
          const firstWith = group.items.find((it) =>
            readScalar(it.parsed, f),
          );
          choices[f] = firstWith
            ? `temp:${firstWith.tempId}`
            : `temp:${group.items[0].tempId}`;
        }
        init[group.groupId] = {
          fieldChoices: choices,
          primaryTempId: group.items[0].tempId,
          discard: false,
        };
      }
      setResolutions(init);
      if (res.data.conflicts.length === 0) {
        // No conflicts: jump straight to commit.
        commitNoConflicts(res.data);
      } else {
        setPhase("review");
      }
    });
  }

  function commitNoConflicts(pr: BulkParseResult) {
    setPhase("committing");
    const decisions: BulkCommitDecision[] = pr.items.map((it) => ({
      kind: "create-new",
      tempId: it.tempId,
    }));
    startTransition(async () => {
      const res = await commitBulkCVsAction({
        jobId,
        items: pr.items,
        decisions,
      });
      if (!res.ok) {
        setError(res.error);
        setPhase("idle");
        return;
      }
      const total = res.data.created + res.data.updated;
      toast.success(
        `${total} candidato${total === 1 ? "" : "s"} creado${total === 1 ? "" : "s"}`,
      );
      setPhase("done");
      router.refresh();
    });
  }

  function commitWithResolutions() {
    if (!parseResult) return;
    setPhase("committing");

    const conflictItemIds = new Set<string>();
    for (const g of parseResult.conflicts)
      for (const i of g.items) conflictItemIds.add(i.tempId);

    const decisions: BulkCommitDecision[] = [];

    // 1. Items NOT in any conflict → create-new.
    for (const it of parseResult.items) {
      if (!conflictItemIds.has(it.tempId)) {
        decisions.push({ kind: "create-new", tempId: it.tempId });
      }
    }

    // 2. For each conflict group → commit per its resolution.
    for (const group of parseResult.conflicts) {
      const r = resolutions[group.groupId];
      if (!r) continue;
      if (r.discard) {
        decisions.push({
          kind: "discard",
          tempIds: group.items.map((i) => i.tempId),
        });
        continue;
      }
      const fields = buildFieldsFromChoices(group, r.fieldChoices);
      if (group.existing) {
        decisions.push({
          kind: "update-existing",
          candidateId: group.existing.id,
          tempIds: group.items.map((i) => i.tempId),
          primaryTempId: r.primaryTempId,
          fields,
        });
      } else {
        decisions.push({
          kind: "create-merged",
          tempIds: group.items.map((i) => i.tempId),
          primaryTempId: r.primaryTempId,
          fields,
        });
      }
    }

    startTransition(async () => {
      const res = await commitBulkCVsAction({
        jobId,
        items: parseResult.items,
        decisions,
      });
      if (!res.ok) {
        setError(res.error);
        setPhase("review");
        return;
      }
      const total = res.data.created + res.data.updated;
      toast.success(
        `${total} candidato${total === 1 ? "" : "s"} creado${total === 1 ? "" : "s"}`,
      );
      setPhase("done");
      router.refresh();
    });
  }

  function buildFieldsFromChoices(
    group: BulkConflictGroup,
    choices: Record<keyof ResolvedScalarFields, string>,
  ): ResolvedScalarFields {
    const out: ResolvedScalarFields = {};
    for (const f of SCALAR_FIELDS) {
      const source = choices[f];
      if (!source) continue;
      let value: string | null | undefined;
      if (source === "existing" && group.existing) {
        value = readScalar(group.existing, f);
      } else if (source.startsWith("temp:")) {
        const tempId = source.slice("temp:".length);
        const item = group.items.find((i) => i.tempId === tempId);
        if (item) value = readScalar(item.parsed, f);
      }
      if (value != null && value !== "") {
        out[f] = value;
      }
    }
    return out;
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && phase !== "committing" && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="fixed left-[50%] top-[50%] z-50 flex h-[min(90vh,720px)] w-[min(95vw,900px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background shadow-modal"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-base font-semibold">
              {phase === "review"
                ? "Resuelve duplicados antes de importar"
                : "Bulk upload de CVs"}
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              disabled={phase === "committing"}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {phase === "idle" || phase === "parsing" ? (
              <IdlePhase
                files={files}
                onPick={() => fileInputRef.current?.click()}
                onAdd={(fs) => addFiles(fs)}
                onRemove={removeFile}
                parsing={phase === "parsing"}
              />
            ) : phase === "review" && parseResult ? (
              <ReviewPhase
                parseResult={parseResult}
                resolutions={resolutions}
                setResolutions={setResolutions}
              />
            ) : phase === "committing" ? (
              <Centered>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">Guardando…</p>
              </Centered>
            ) : phase === "done" && parseResult ? (
              <DonePhase parseResult={parseResult} />
            ) : null}
            {error ? (
              <p className="mt-3 text-xs text-danger">{error}</p>
            ) : null}
          </div>

          {phase === "idle" ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <span className="text-xs text-muted-foreground">
                {files.length} / {BULK_MAX_FILES} archivos · máx{" "}
                {Math.round(BULK_MAX_FILE_BYTES / 1024 / 1024)} MB c/u
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
                <Button
                  onClick={onParse}
                  disabled={isPending || files.length === 0}
                  className="gap-2"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Procesar {files.length} archivo{files.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "review" && parseResult ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <span className="text-xs text-muted-foreground">
                {parseResult.conflicts.length} grupo
                {parseResult.conflicts.length === 1 ? "" : "s"} de duplicados
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={commitWithResolutions} disabled={isPending}>
                  {isPending ? "Guardando…" : "Importar todos"}
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "done" ? (
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button onClick={onClose}>Cerrar</Button>
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      {children}
    </div>
  );
}

function IdlePhase({
  files,
  onPick,
  onAdd,
  onRemove,
  parsing,
}: {
  files: File[];
  onPick: () => void;
  onAdd: (fs: FileList | File[]) => void;
  onRemove: (i: number) => void;
  parsing: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  if (parsing) {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Parseando {files.length} CVs… (~{files.length * 4}s)
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Esto puede tardar un momento. No cierres esta ventana.
        </p>
      </Centered>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div
        onClick={onPick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) onAdd(e.dataTransfer.files);
        }}
        className={cn(
          "flex h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 transition-colors hover:bg-muted/40",
          dragOver && "border-accent bg-accent/5",
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Arrastra CVs aquí</p>
        <p className="mt-1 text-xs text-muted-foreground">
          o haz click para seleccionar (PDF, máx {Math.round(BULK_MAX_FILE_BYTES / 1024 / 1024)} MB c/u)
        </p>
      </div>
      {files.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(f.size / 1024)} KB
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Quitar ${f.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ReviewPhase({
  parseResult,
  resolutions,
  setResolutions,
}: {
  parseResult: BulkParseResult;
  resolutions: ResolutionState;
  setResolutions: (next: ResolutionState) => void;
}) {
  const conflictItemIds = useMemo(() => {
    const s = new Set<string>();
    for (const g of parseResult.conflicts)
      for (const i of g.items) s.add(i.tempId);
    return s;
  }, [parseResult]);
  const cleanItems = parseResult.items.filter(
    (i) => !conflictItemIds.has(i.tempId),
  );

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>{parseResult.conflicts.length}</strong> grupo
        {parseResult.conflicts.length === 1 ? "" : "s"} de CVs comparten email
        con otro CV del batch o con un candidato existente. Escoge qué valores
        se quedan en cada campo.
      </div>

      {parseResult.failed.length > 0 ? (
        <FailedSection failed={parseResult.failed} />
      ) : null}

      {cleanItems.length > 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <strong>{cleanItems.length}</strong> CV
          {cleanItems.length === 1 ? " va" : "s van"} a importarse sin conflicto
          al clickear &quot;Importar todos&quot;.
        </div>
      ) : null}

      <div className="space-y-4">
        {parseResult.conflicts.map((group) => (
          <ConflictCard
            key={group.groupId}
            group={group}
            state={resolutions[group.groupId]}
            onChange={(nextState) =>
              setResolutions({ ...resolutions, [group.groupId]: nextState })
            }
          />
        ))}
      </div>
    </div>
  );
}

function ConflictCard({
  group,
  state,
  onChange,
}: {
  group: BulkConflictGroup;
  state: ResolutionState[string] | undefined;
  onChange: (s: ResolutionState[string]) => void;
}) {
  if (!state) return null;
  const sources: Array<{
    key: string;
    label: string;
    isExisting: boolean;
    tempId?: string;
  }> = [];
  if (group.existing) {
    sources.push({ key: "existing", label: "Candidato existente", isExisting: true });
  }
  for (const it of group.items) {
    sources.push({
      key: `temp:${it.tempId}`,
      label: it.filename,
      isExisting: false,
      tempId: it.tempId,
    });
  }

  function valueAt(sourceKey: string, field: keyof ResolvedScalarFields): string {
    if (sourceKey === "existing" && group.existing) {
      return readScalar(group.existing, field) ?? "";
    }
    if (sourceKey.startsWith("temp:")) {
      const tempId = sourceKey.slice("temp:".length);
      const item = group.items.find((i) => i.tempId === tempId);
      return (item && readScalar(item.parsed, field)) ?? "";
    }
    return "";
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{group.email}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {sources.length} fuente{sources.length === 1 ? "" : "s"}
          </span>
          {group.existing ? (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-800">
              Match con candidato existente
            </span>
          ) : null}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={state.discard}
            onChange={(e) =>
              onChange({ ...state, discard: e.target.checked })
            }
            className="h-3.5 w-3.5"
          />
          Descartar este grupo
        </label>
      </div>

      {!state.discard ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Campo</th>
                {sources.map((s) => (
                  <th key={s.key} className="px-3 py-2 font-medium">
                    <span className="block max-w-[180px] truncate" title={s.label}>
                      {s.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCALAR_FIELDS.map((field) => {
                const values = sources.map((s) => valueAt(s.key, field));
                const allEmpty = values.every((v) => !v);
                if (allEmpty) return null;
                const distinct = new Set(values.filter((v) => v));
                const isUnanimous = distinct.size <= 1;
                return (
                  <tr
                    key={field}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      !isUnanimous && "bg-amber-50/40",
                    )}
                  >
                    <td className="px-3 py-2 font-medium text-muted-foreground">
                      {FIELD_LABEL[field]}
                    </td>
                    {sources.map((s, idx) => {
                      const v = values[idx];
                      const selected = state.fieldChoices[field] === s.key;
                      const canSelect = Boolean(v);
                      return (
                        <td
                          key={s.key}
                          className={cn(
                            "px-3 py-2 align-top",
                            !isUnanimous &&
                              canSelect &&
                              "cursor-pointer hover:bg-amber-100/60",
                            selected && !isUnanimous && "bg-amber-100",
                          )}
                          onClick={() => {
                            if (!canSelect || isUnanimous) return;
                            onChange({
                              ...state,
                              fieldChoices: {
                                ...state.fieldChoices,
                                [field]: s.key,
                              },
                            });
                          }}
                        >
                          {v ? (
                            <div className="flex items-start gap-1.5">
                              {!isUnanimous ? (
                                <input
                                  type="radio"
                                  name={`${group.groupId}-${field}`}
                                  checked={selected}
                                  onChange={() => {}}
                                  className="mt-0.5 h-3 w-3"
                                />
                              ) : null}
                              <span className="break-words">{v}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {group.items.length > 1 ? (
                <tr className="border-t-2 border-border bg-muted/20">
                  <td className="px-3 py-2 font-medium text-muted-foreground">
                    PDF que se conserva
                  </td>
                  {sources.map((s) => (
                    <td key={s.key} className="px-3 py-2">
                      {s.isExisting ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`${group.groupId}-primary`}
                            checked={state.primaryTempId === s.tempId}
                            onChange={() =>
                              onChange({
                                ...state,
                                primaryTempId: s.tempId!,
                              })
                            }
                            className="h-3 w-3"
                          />
                          <span className="text-[11px]">Usar este</span>
                        </label>
                      )}
                    </td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function FailedSection({ failed }: { failed: BulkFailedItem[] }) {
  return (
    <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-danger">
        <AlertCircle className="h-3.5 w-3.5" />
        {failed.length} CV{failed.length === 1 ? "" : "s"} no se pudieron parsear
      </div>
      <ul className="mt-1 space-y-0.5 text-[11px] text-danger">
        {failed.map((f) => (
          <li key={f.filename}>
            <span className="font-medium">{f.filename}</span> — {f.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DonePhase({ parseResult }: { parseResult: BulkParseResult }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <CheckCircle2 className="h-10 w-10 text-emerald-600" />
      <p className="mt-3 text-base font-medium">Listo</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Importados {parseResult.items.length} CVs.
      </p>
      {parseResult.failed.length > 0 ? (
        <p className="mt-2 text-xs text-amber-700">
          {parseResult.failed.length} archivo
          {parseResult.failed.length === 1 ? "" : "s"} no se pudieron parsear y
          se omitieron.
        </p>
      ) : null}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

type Readable =
  | import("@/lib/cv-batch").BulkExistingCandidate
  | import("@/lib/resume-parse").ParsedProfile;

function readScalar(
  obj: Readable,
  field: keyof ResolvedScalarFields,
): string | null {
  if (!obj) return null;
  // BulkExistingCandidate stores subset on the row + parsed_profile inside.
  if ("parsed_profile" in obj) {
    // It's the existing candidate row.
    const flat = obj as import("@/lib/cv-batch").BulkExistingCandidate;
    const direct: Partial<Record<keyof ResolvedScalarFields, string | null>> = {
      full_name: flat.full_name,
      email: flat.email,
      phone: flat.phone,
      linkedin_url: flat.linkedin_url,
    };
    if (direct[field] !== undefined) return direct[field] ?? null;
    const profile = flat.parsed_profile;
    if (!profile) return null;
    const fromProfile = profile[field as keyof typeof profile];
    return typeof fromProfile === "string" ? fromProfile : null;
  }
  // It's a ParsedProfile from the batch.
  const p = obj as import("@/lib/resume-parse").ParsedProfile;
  const v = p[field as keyof typeof p];
  return typeof v === "string" ? v : null;
}
