"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createContactAction } from "./actions";

/**
 * URL-driven create slot. The page-level "+ Nuevo contacto" button
 * was removed in favor of the global "+" menu in the sidebar — that
 * menu navigates here with `?create=1`. Mount this once per page and
 * it pops the form open whenever the param is present.
 */
export function CreateContactButton({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams?.get("create") === "1";
  function close() {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `/contacts?${qs}` : "/contacts", { scroll: false });
  }
  if (!open) return null;
  return <Form companies={companies} onClose={close} />;
}

function Form({
  companies,
  onClose,
}: {
  companies: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createContactAction({
        fullName: String(fd.get("full_name") ?? ""),
        email: (fd.get("email") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        linkedinUrl: (fd.get("linkedin_url") as string) || undefined,
        title: (fd.get("title") as string) || undefined,
        companyId: (fd.get("company_id") as string) || undefined,
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
      <h3 className="mb-3 text-sm font-semibold">Nuevo contacto</h3>
      <div className="space-y-2">
        <Input name="full_name" placeholder="Nombre completo *" required />
        <Input name="title" placeholder="Puesto (opcional)" />
        <Input name="email" placeholder="Email" type="email" />
        <Input name="phone" placeholder="Teléfono" />
        <Input name="linkedin_url" placeholder="LinkedIn URL" />
        <select
          name="company_id"
          defaultValue=""
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Sin empresa</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
          onClick={onClose}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
