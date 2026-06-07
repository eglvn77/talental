"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, FileText, Linkedin, Sheet, UserPlus, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/i18n/client";
import type { CandidateSource } from "@/lib/hiring";
import { loadAddCandidateTargetsAction } from "@/app/(app)/actions";
import { ManualAddCandidateDialog } from "@/app/(app)/jobs/[jobId]/add-candidate";
import { BulkUploadDialog } from "@/app/(app)/jobs/[jobId]/bulk-upload-modal";
import { LinkedinImportDialog } from "@/app/(app)/jobs/[jobId]/linkedin-import-modal";

type Method = "manual" | "bulk" | "linkedin";
type JobTarget = { id: string; title: string; stages: { id: string; name: string }[] };

/**
 * Single, app-wide "add candidates" flow. Opened by `?addCandidates=1`
 * from every entry point. The picker collects the DESTINATION once —
 * source, the target vacante (only offered when not already in one), and
 * the pipeline stage — then the chosen method's dialog runs with those.
 * `?job=<id>` fixes the vacante (per-vacante entry points); otherwise the
 * recruiter may optionally pick one. Mounted once in (app)/layout.
 */
export function AddCandidatesHost() {
  const router = useRouter();
  const sp = useSearchParams();
  const t = useT();
  const open = sp?.get("addCandidates") === "1";
  const contextJobId = sp?.get("job") || undefined;
  const [method, setMethod] = useState<Method | null>(null);

  const [source, setSource] = useState<CandidateSource>("direct");
  const [targets, setTargets] = useState<JobTarget[]>([]);
  const [chosenJobId, setChosenJobId] = useState<string>("");
  const [stageId, setStageId] = useState<string>("");

  // Lazy-load vacantes + their stages when the flow opens.
  useEffect(() => {
    if (!open) {
      setMethod(null);
      return;
    }
    let alive = true;
    void (async () => {
      const res = await loadAddCandidateTargetsAction();
      if (alive && res.ok) setTargets(res.data.jobs);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // The vacante actually being targeted: the URL context wins; otherwise
  // the one the recruiter picked (empty = talent pool).
  const jobId = contextJobId || chosenJobId || "";
  const stages = useMemo(
    () => targets.find((j) => j.id === jobId)?.stages ?? [],
    [targets, jobId],
  );

  // Default the stage to the first one whenever the target vacante
  // changes (and reset when there's no vacante).
  useEffect(() => {
    if (stages.length > 0) setStageId((cur) => (cur && stages.some((s) => s.id === cur) ? cur : stages[0].id));
    else setStageId("");
  }, [stages]);

  function close() {
    const next = new URLSearchParams(sp?.toString() ?? "");
    next.delete("addCandidates");
    next.delete("job");
    const qs = next.toString();
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  function pickCsv() {
    const params = new URLSearchParams({ tab: "csv", source });
    if (jobId) params.set("job", jobId);
    if (jobId && stageId) params.set("stage", stageId);
    router.push(`/candidates/import?${params.toString()}`);
  }

  const passStageId = jobId ? stageId || null : null;

  return (
    <>
      <Dialog.Root
        open={open && method === null}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,480px)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-background shadow-modal">
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
            <div className="space-y-4 p-5">
              {/* Vacante picker only — Source + Stage are asked by the
                  method-specific dialog AFTER the recruiter picks how to
                  add. Per-vacante entry points pass ?job=<id>, hiding
                  this select entirely. */}
              {!contextJobId ? (
                <Field label={t("candidateImport.destVacancy")}>
                  <Select
                    value={chosenJobId}
                    onChange={setChosenJobId}
                    searchable={targets.length > 8}
                    options={[
                      { value: "", label: t("candidateImport.destPoolOnly") },
                      ...targets.map((j) => ({ value: j.id, label: j.title })),
                    ]}
                  />
                </Field>
              ) : null}

              <p className="text-sm text-muted-foreground">
                {t("candidateImport.pickerTitle")}
              </p>
              <div className="space-y-2">
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
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ManualAddCandidateDialog
        jobId={jobId || undefined}
        source={source}
        onSourceChange={setSource}
        stages={stages}
        stageId={passStageId}
        onStageChange={setStageId}
        open={open && method === "manual"}
        onClose={close}
      />
      {open && method === "bulk" ? (
        <BulkUploadDialog
          jobId={jobId || undefined}
          source={source}
          onSourceChange={setSource}
          stages={stages}
          stageId={passStageId}
          onStageChange={setStageId}
          onClose={close}
        />
      ) : null}
      <LinkedinImportDialog
        jobId={jobId || undefined}
        source={source}
        onSourceChange={setSource}
        stages={stages}
        stageId={passStageId}
        onStageChange={setStageId}
        open={open && method === "linkedin"}
        onClose={close}
      />
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
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
