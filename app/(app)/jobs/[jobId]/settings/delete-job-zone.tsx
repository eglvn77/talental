"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { deleteJobAction } from "../../../actions";

export function DeleteJobZone({
  jobId,
  title,
}: {
  jobId: string;
  title: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirm.trim() === title;

  function onDelete() {
    if (!canDelete || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteJobAction(jobId);
      if (!res.ok) setError(res.error);
      else router.push("/jobs");
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Escribe el título de la vacante{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {title}
        </code>{" "}
        para confirmar.
      </p>
      <Input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Título de la vacante"
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete || isPending}
          className="inline-flex h-9 items-center rounded-md bg-danger px-4 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? "Eliminando…" : "Eliminar vacante"}
        </button>
      </div>
    </div>
  );
}
