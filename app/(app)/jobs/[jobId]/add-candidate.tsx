"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type CandidateSource } from "@/lib/hiring";
import { addCandidateAction } from "../../actions";

const SOURCES: CandidateSource[] = [
  "linkedin",
  "indeed",
  "referral",
  "direct",
  "other",
];

const SOURCE_LABEL: Record<CandidateSource, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  referral: "Referido",
  direct: "Directo",
  other: "Otro",
  bulk_import: "Importado Manualmente",
};

/**
 * Manual add-candidate dialog. Controlled — the parent decides when
 * it opens. When `jobId` is provided the candidate also gets an
 * application in that job's first stage; without `jobId` the
 * candidate lands in the talent pool only.
 */
export function ManualAddCandidateDialog({
  jobId,
  open,
  onClose,
}: {
  jobId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<CandidateSource>("linkedin");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await addCandidateAction({
        jobId,
        fullName: String(fd.get("full_name") ?? ""),
        email: (fd.get("email") as string) || undefined,
        linkedinUrl: (fd.get("linkedin_url") as string) || undefined,
        source: (fd.get("source") as CandidateSource) ?? "other",
      });
      if (!res.ok) setError(res.error);
      else {
        (e.target as HTMLFormElement).reset();
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-[min(95vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background shadow-modal">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-base font-semibold">
              Nuevo candidato
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={onSubmit} className="p-5">
            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Nombre completo *
                </span>
                <Input name="full_name" required className="mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Correo
                </span>
                <Input name="email" type="email" className="mt-1" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  URL de LinkedIn
                </span>
                <Input name="linkedin_url" className="mt-1" />
              </label>
              <div className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  Fuente
                </span>
                <Select
                  value={source}
                  onChange={(v) => setSource(v as CandidateSource)}
                  options={SOURCES.map((s) => ({
                    value: s,
                    label: SOURCE_LABEL[s],
                  }))}
                />
                <input type="hidden" name="source" value={source} />
              </div>
            </div>
            {error ? (
              <p className="mt-3 text-xs text-danger">{error}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Agregando…" : "Agregar"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
