"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CandidateSource } from "@/lib/hiring";
import { addCandidateAction } from "../actions";

const SOURCES: CandidateSource[] = [
  "linkedin",
  "indeed",
  "referral",
  "direct",
  "other",
];

export function AddCandidateForm({ roleId }: { roleId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await addCandidateAction({
        roleId,
        fullName: String(fd.get("full_name") ?? ""),
        email: (fd.get("email") as string) || undefined,
        linkedinUrl: (fd.get("linkedin_url") as string) || undefined,
        source: (fd.get("source") as CandidateSource) ?? "other",
      });
      if (!res.ok) setError(res.error);
      else {
        (e.target as HTMLFormElement).reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Agregar candidato
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input name="full_name" placeholder="Nombre completo *" required />
        <Input name="email" type="email" placeholder="Correo" />
        <Input name="linkedin_url" placeholder="URL de LinkedIn" />
        <select
          name="source"
          defaultValue="linkedin"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Agregando…" : "Agregar"}
        </Button>
      </div>
    </form>
  );
}
