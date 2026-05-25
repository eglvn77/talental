"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDealAction } from "./actions";

/** URL-driven create modal — see contacts/create-contact-form for the rationale. */
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
  return <DealDialog companies={companies} open={open} onClose={close} />;
}

function DealDialog({
  companies,
  open,
  onClose,
}: {
  companies: Array<{ id: string; name: string }>;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (isPending) return;
    setError(null);
    onClose();
  }

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
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,480px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background shadow-modal">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-base font-semibold">
              Nuevo deal
            </Dialog.Title>
            <button
              type="button"
              onClick={close}
              disabled={isPending}
              aria-label="Cerrar"
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-3 p-5">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                Título del deal *
              </span>
              <Input
                name="title"
                required
                disabled={isPending}
                className="mt-1.5"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                Empresa
              </span>
              <select
                name="company_id"
                defaultValue=""
                disabled={isPending}
                className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Sin empresa</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Monto
                </span>
                <Input
                  name="value_amount"
                  type="number"
                  min={0}
                  step={1}
                  disabled={isPending}
                  className="mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Moneda
                </span>
                <select
                  name="value_currency"
                  defaultValue="MXN"
                  disabled={isPending}
                  className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                Cierre esperado
              </span>
              <Input
                name="expected_close_date"
                type="date"
                disabled={isPending}
                className="mt-1.5"
              />
            </label>
            {error ? (
              <p className="rounded-md border border-danger-soft bg-danger-soft/40 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={close}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando…" : "Crear deal"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
