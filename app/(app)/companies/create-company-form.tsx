"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CompanyStatus } from "@/lib/hiring";
import { createCompanyAction } from "../actions";

const STATUSES: CompanyStatus[] = ["prospect", "client", "partner", "none"];

const STATUS_ES: Record<CompanyStatus, string> = {
  prospect: "Prospecto",
  client: "Cliente",
  partner: "Aliado",
  none: "Otra",
};

/** URL-driven create slot — see contacts/create-contact-form for the rationale. */
export function CreateCompanyButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams?.get("create") === "1";
  function close() {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `/companies?${qs}` : "/companies", { scroll: false });
  }
  if (!open) return null;
  return <Form onClose={close} />;
}

function Form({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createCompanyAction({
        name: String(fd.get("name") ?? ""),
        websiteUrl: (fd.get("website_url") as string) || undefined,
        linkedinUrl: (fd.get("linkedin_url") as string) || undefined,
        status: (fd.get("status") as CompanyStatus) || "prospect",
      });
      if (!res.ok) setError(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="absolute right-6 top-24 z-30 w-[360px] rounded-lg border border-border bg-card p-4 shadow-dropdown"
    >
      <h3 className="mb-3 text-sm font-semibold">Nueva empresa</h3>
      <div className="space-y-2">
        <Input name="name" placeholder="Nombre de la empresa *" required />
        <Input
          name="website_url"
          placeholder="Página web (opcional)"
          type="url"
        />
        <Input name="linkedin_url" placeholder="URL de LinkedIn" />
        <select
          name="status"
          defaultValue="prospect"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_ES[s]}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        El logo y dominio se obtienen del sitio web automáticamente.
      </p>
      {error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando…" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
