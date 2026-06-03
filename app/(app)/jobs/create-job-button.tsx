"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ProcessTemplateOption } from "./new/new-job-form";
import { CreateJobForm } from "./new/create-job-form";
import type { CustomFieldDefinitionRow } from "@/lib/hiring";
import { useT } from "@/lib/i18n/client";

/**
 * URL-driven create-vacante modal. The global "+ Crear" menu and the
 * page-header "+" button both navigate here with `?create=1`, which
 * pops the modal open. Mount once on /jobs; `close()` strips the
 * param via `router.replace`. Same pattern as the contact / deal /
 * company create modals.
 *
 * Page-server loads the workspace's templates and passes them in so
 * the form's Proceso selector is hydrated synchronously.
 */
export function CreateJobButton({
  templates,
  customFieldDefs,
  kickoffPrompts = [],
}: {
  templates: ProcessTemplateOption[];
  customFieldDefs: CustomFieldDefinitionRow[];
  /** Optional. When 2+ are passed the form surfaces a picker so the
   *  user can choose which playbook the AI runs. */
  kickoffPrompts?: Array<{ key: string; label: string; is_default: boolean }>;
}) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams?.get("create") === "1";

  function close() {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,560px)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-background shadow-modal">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <Dialog.Title className="text-base font-semibold">
              {t("jobsList.newJobTitle")}
            </Dialog.Title>
            <button
              type="button"
              onClick={close}
              aria-label={t("jobsList.close")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-5">
            <CreateJobForm
              templates={templates}
              customFieldDefs={customFieldDefs}
              kickoffPrompts={kickoffPrompts}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
