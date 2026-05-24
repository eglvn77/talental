"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDealAction } from "./actions";

/** URL-driven create slot — see contacts/create-contact-form for the rationale. */
export function CreateDealButton({
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
    router.replace(qs ? `/deals?${qs}` : "/deals", { scroll: false });
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
    const amountRaw = (fd.get("value_amount") as string) || "";
    const amount = amountRaw ? Number(amountRaw) : null;
    startTransition(async () => {
      const res = await createDealAction({
        title: String(fd.get("title") ?? ""),
        companyId: (fd.get("company_id") as string) || null,
        valueAmount: Number.isFinite(amount as number) ? (amount as number) : null,
        valueCurrency: (fd.get("value_currency") as string) || "MXN",
        expectedCloseDate: (fd.get("expected_close_date") as string) || null,
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
      <h3 className="mb-3 text-sm font-semibold">Nuevo deal</h3>
      <div className="space-y-2">
        <Input name="title" placeholder="Título del deal *" required />
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
        <div className="flex gap-2">
          <Input
            name="value_amount"
            placeholder="Monto"
            type="number"
            min={0}
            step={1}
            className="flex-1"
          />
          <select
            name="value_currency"
            defaultValue="MXN"
            className="w-24 rounded-md border border-border bg-background px-2 py-2 text-sm"
          >
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <Input
          name="expected_close_date"
          placeholder="Cierre esperado"
          type="date"
        />
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
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
