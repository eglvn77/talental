"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createContactAction } from "./actions";

/**
 * URL-driven create modal. The global "+ Crear" menu navigates here
 * with `?create=1`, which pops the modal open. Mount once per page;
 * `close()` strips the param via router.replace.
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
  return <ContactDialog companies={companies} open={open} onClose={close} />;
}

function ContactDialog({
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
  // Controlled value for the company picker. The form still submits
  // via FormData, so we mirror the value into a hidden input below.
  const [companyId, setCompanyId] = useState<string>("");

  function close() {
    if (isPending) return;
    setError(null);
    onClose();
  }

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
              Nuevo contacto
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
                Nombre completo *
              </span>
              <Input
                name="full_name"
                required
                disabled={isPending}
                className="mt-1.5"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Puesto
                </span>
                <Input name="title" disabled={isPending} className="mt-1.5" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Email
                </span>
                <Input
                  name="email"
                  type="email"
                  disabled={isPending}
                  className="mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Teléfono
                </span>
                <Input name="phone" disabled={isPending} className="mt-1.5" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  LinkedIn
                </span>
                <Input
                  name="linkedin_url"
                  disabled={isPending}
                  className="mt-1.5"
                />
              </label>
            </div>
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                Empresa
              </span>
              <Select
                value={companyId}
                onChange={setCompanyId}
                disabled={isPending}
                placeholder="Sin empresa"
                searchable={companies.length > 8}
                options={[
                  { value: "", label: "Sin empresa" },
                  ...companies.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
              />
              <input type="hidden" name="company_id" value={companyId} />
            </div>
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
                {isPending ? "Guardando…" : "Crear contacto"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
