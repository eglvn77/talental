"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, FileText, Linkedin, Sheet, UserPlus, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { ManualAddCandidateDialog } from "@/app/(app)/jobs/[jobId]/add-candidate";
import { BulkUploadDialog } from "@/app/(app)/jobs/[jobId]/bulk-upload-modal";
import { LinkedinImportDialog } from "@/app/(app)/jobs/[jobId]/linkedin-import-modal";

type Method = "manual" | "bulk" | "linkedin";

/**
 * Single, app-wide "add candidates" flow. Opened by `?addCandidates=1`
 * from ANY entry point — the per-vacante header, the candidates table,
 * the global "+" menu, and the jobs-table row menu — so every path uses
 * the exact same method picker and the same downstream dialogs.
 *
 * `?job=<id>` carries the vacante context: when present, each method
 * attaches the candidate to that job's first stage; when absent the
 * candidate lands in the talent pool. Mounted once in (app)/layout.
 *
 * Mirrors the `?create=1` pattern used by the job/company/contact
 * create modals + the global slideover host.
 */
export function AddCandidatesHost() {
  const router = useRouter();
  const sp = useSearchParams();
  const t = useT();
  const open = sp?.get("addCandidates") === "1";
  const jobId = sp?.get("job") || undefined;
  const [method, setMethod] = useState<Method | null>(null);

  // Clear the chosen method whenever the flow closes via the URL.
  useEffect(() => {
    if (!open) setMethod(null);
  }, [open]);

  function close() {
    const next = new URLSearchParams(sp?.toString() ?? "");
    next.delete("addCandidates");
    next.delete("job");
    const qs = next.toString();
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  function pickCsv() {
    router.push(
      jobId
        ? `/candidates/import?tab=csv&job=${jobId}`
        : "/candidates/import?tab=csv",
    );
  }

  return (
    <>
      {/* Method picker. onOpenChange only fires on user dismiss (escape /
          overlay) — choosing a method flips `method` and closes this
          dialog programmatically without firing it, so the URL stays. */}
      <Dialog.Root
        open={open && method === null}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,460px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-background shadow-modal">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <Dialog.Title className="text-base font-semibold">
                {t("candidateImport.addCandidates")}
              </Dialog.Title>
              <button
                type="button"
                onClick={close}
                aria-label={t("candidateImport.close")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-muted-foreground">
                {t("candidateImport.pickerTitle")}
              </p>
              <MethodCard
                icon={<UserPlus className="h-4 w-4" />}
                title={t("candidateImport.manually")}
                desc={t("candidateImport.manuallyDesc")}
                onClick={() => setMethod("manual")}
              />
              <MethodCard
                icon={<FileText className="h-4 w-4" />}
                title={t("candidateImport.importCvs")}
                desc={t("candidateImport.importCvsDesc")}
                onClick={() => setMethod("bulk")}
              />
              <MethodCard
                icon={<Linkedin className="h-4 w-4" />}
                title={t("candidateImport.linkedinLinks")}
                desc={t("candidateImport.linkedinLinksDesc")}
                onClick={() => setMethod("linkedin")}
              />
              <MethodCard
                icon={<Sheet className="h-4 w-4" />}
                title={t("candidateImport.importCsv")}
                desc={t("candidateImport.importCsvDesc")}
                onClick={pickCsv}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ManualAddCandidateDialog
        jobId={jobId}
        open={open && method === "manual"}
        onClose={close}
      />
      {open && method === "bulk" ? (
        <BulkUploadDialog jobId={jobId} onClose={close} />
      ) : null}
      <LinkedinImportDialog
        jobId={jobId}
        open={open && method === "linkedin"}
        onClose={close}
      />
    </>
  );
}

function MethodCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-bg-2"
    >
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-3 text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {desc}
        </span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
