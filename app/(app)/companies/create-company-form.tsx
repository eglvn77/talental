"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createCompanyAction } from "../actions";
import { useT } from "@/lib/i18n/client";

export type CompanyStatusOption = { value: string; label: string };

/** URL-driven create modal — see contacts/create-contact-form for the rationale. */
export function CreateCompanyButton({
  statuses,
}: {
  /** Workspace company statuses (ordered) for the Tipo dropdown. */
  statuses: CompanyStatusOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams?.get("create") === "1";
  function close() {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `/companies?${qs}` : "/companies", { scroll: false });
  }
  return <CompanyDialog open={open} onClose={close} statuses={statuses} />;
}

function CompanyDialog({
  open,
  onClose,
  statuses,
}: {
  open: boolean;
  onClose: () => void;
  statuses: CompanyStatusOption[];
}) {
  const router = useRouter();
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(statuses[0]?.value ?? "");

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
      const res = await createCompanyAction({
        name: String(fd.get("name") ?? ""),
        websiteUrl: (fd.get("website_url") as string) || undefined,
        linkedinUrl: (fd.get("linkedin_url") as string) || undefined,
        status: (fd.get("status") as string) || undefined,
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
              {t("companiesArea.newCompanyTitle")}
            </Dialog.Title>
            <button
              type="button"
              onClick={close}
              disabled={isPending}
              aria-label={t("companiesArea.close")}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-3 p-5">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {t("companiesArea.companyNameLabel")}
              </span>
              <Input
                name="name"
                required
                disabled={isPending}
                className="mt-1.5"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {t("companiesArea.websiteLabel")}
              </span>
              <Input
                name="website_url"
                type="url"
                placeholder="https://…"
                disabled={isPending}
                className="mt-1.5"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {t("companiesArea.websiteHelp")}
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                {t("companiesArea.linkedinLabel")}
              </span>
              <Input
                name="linkedin_url"
                placeholder="https://linkedin.com/company/…"
                disabled={isPending}
                className="mt-1.5"
              />
            </label>
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                {t("companiesArea.typeLabel")}
              </span>
              <Select
                value={status}
                onChange={(v) => setStatus(v)}
                disabled={isPending}
                options={statuses}
              />
              <input type="hidden" name="status" value={status} />
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
                {t("companiesArea.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t("companiesArea.creating") : t("companiesArea.createCompany")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
