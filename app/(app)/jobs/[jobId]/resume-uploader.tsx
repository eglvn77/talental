"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Sparkles, Trash2, Upload } from "lucide-react";
import {
  deleteResumeAction,
  getResumeSignedUrlAction,
  parseResumeAction,
  uploadResumeAction,
} from "../../actions";

export function ResumeUploader({
  candidateId,
  resumePath,
  hasParsedProfile,
  revalidatePath,
}: {
  candidateId: string;
  resumePath: string | null;
  hasParsedProfile: boolean;
  revalidatePath: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile() {
    inputRef.current?.click();
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("candidate_id", candidateId);
    fd.set("file", file);
    fd.set("revalidate", revalidatePath);
    startTransition(async () => {
      setStatus("Subiendo…");
      const res = await uploadResumeAction(fd);
      if (!res.ok) {
        setError(res.error);
        setStatus(null);
        return;
      }
      // Auto-parse after upload (only fill empty fields).
      setStatus("Procesando con IA…");
      const parsed = await parseResumeAction({
        candidateId,
        fillOnlyEmpty: true,
        revalidate: revalidatePath,
      });
      if (!parsed.ok) {
        // Upload succeeded; surface parse failure but keep going.
        setError(`Uploaded but parse failed: ${parsed.error}`);
      }
      setStatus(null);
      router.refresh();
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function reparse() {
    setError(null);
    startTransition(async () => {
      setStatus("Procesando con IA…");
      const res = await parseResumeAction({
        candidateId,
        // On manual re-parse, overwrite all fields with parsed values.
        fillOnlyEmpty: false,
        revalidate: revalidatePath,
      });
      if (!res.ok) setError(res.error);
      setStatus(null);
      router.refresh();
    });
  }

  function open() {
    setError(null);
    startTransition(async () => {
      const res = await getResumeSignedUrlAction(candidateId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteResumeAction({
        candidateId,
        revalidate: revalidatePath,
      });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  const fileName = resumePath
    ? resumePath.split("/").slice(-1)[0]?.replace(/^\d+_/, "")
    : null;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.doc,.docx"
        className="hidden"
        onChange={onChange}
      />
      {resumePath ? (
        <div className="flex items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={open}
            disabled={isPending}
            className="inline-flex items-center gap-1 truncate hover:underline"
            title={fileName ?? "Abrir CV"}
          >
            <span className="max-w-[140px] truncate">
              {fileName ?? "Resume"}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
          <button
            type="button"
            onClick={reparse}
            disabled={isPending}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Volver a procesar con IA"
            title={hasParsedProfile ? "Volver a procesar con IA" : "Procesar con IA"}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={pickFile}
            disabled={isPending}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Reemplazar CV"
            title="Reemplazar"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
            aria-label="Eliminar CV"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={pickFile}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <Upload className="h-3.5 w-3.5" />
          {isPending ? "Subiendo…" : "Subir CV"}
        </button>
      )}
      {status ? (
        <p className="mt-1 text-xs text-muted-foreground">{status}</p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      <p className="mt-1 text-[10px] text-muted-foreground">
        PDF, máx 10 MB · procesado automático con IA
      </p>
    </div>
  );
}
