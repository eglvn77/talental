"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Linkedin, CheckCircle2, AlertCircle, RotateCw } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { type TFunction } from "@/lib/i18n/translate";
import {
  enrichFromLinkedinAction,
  type EnrichResultItem,
} from "@/app/(app)/_actions/linkedin-enrich";

/**
 * Paste-LinkedIn-URLs flow: one URL per line, batch enrich via the
 * DataForB2B /enrich/profile endpoint, create candidates + (optionally)
 * applications at the first pipeline stage of the current job.
 *
 * Default credit cost = 1.5 × N (cached). Enable opt-ins for emails or
 * phone if you need contact info (more credits — see the credit hint).
 */
export function LinkedinImportDialog({
  jobId,
  open,
  onClose,
}: {
  /** Omit for talent-pool mode (no application created). */
  jobId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState("");
  const [enrichWorkEmail, setEnrichWorkEmail] = useState(false);
  const [enrichPersonalEmail, setEnrichPersonalEmail] = useState(false);
  const [enrichPhone, setEnrichPhone] = useState(false);
  const [results, setResults] = useState<EnrichResultItem[] | null>(null);
  const [pending, startTransition] = useTransition();

  const urls = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [text],
  );
  const costPerUrl =
    1.5 +
    (enrichWorkEmail ? 3 : 0) +
    (enrichPersonalEmail ? 1 : 0) +
    (enrichPhone ? 10 : 0);
  const totalCost = (costPerUrl * urls.length).toFixed(1);

  function reset() {
    setText("");
    setResults(null);
  }

  function submit() {
    startTransition(async () => {
      const res = await enrichFromLinkedinAction({
        urls,
        attachToJobId: jobId,
        enrichWorkEmail,
        enrichPersonalEmail,
        enrichPhone,
      });
      if (!res.ok) {
        toast.actionFailed(t("candidateImport.importFailed"), res.error);
        return;
      }
      setResults(res.data.results);
      const created = res.data.results.filter((r) => r.kind === "created").length;
      const reused = res.data.results.filter((r) => r.kind === "reused").length;
      const errors = res.data.results.filter((r) => r.kind === "error").length;
      const desc = [
        created > 0 ? t("candidateImport.countNew", { count: created }) : null,
        reused > 0
          ? t("candidateImport.countExisted", { count: reused })
          : null,
        errors > 0
          ? t("candidateImport.countErrors", { count: errors })
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      toast.actionOk(
        t("candidateImport.importComplete"),
        desc || t("candidateImport.noChanges"),
      );
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Linkedin className="h-4 w-4 text-accent" />
            {t("candidateImport.linkedinDialogTitle")}
          </DialogTitle>
        </DialogHeader>

        {results === null ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="li-urls"
                className="text-sm font-medium"
              >
                {t("candidateImport.linkedinUrlsLabel")}
              </label>
              <p className="text-xs text-muted-foreground">
                {t("candidateImport.linkedinUrlsHint")}
              </p>
              <textarea
                id="li-urls"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder={
                  "https://www.linkedin.com/in/persona-uno\nhttps://www.linkedin.com/in/persona-dos"
                }
                className="w-full rounded-md border border-border bg-background p-2 text-sm font-mono"
                spellCheck={false}
                disabled={pending}
              />
            </div>

            <fieldset className="space-y-2 rounded-md border border-border bg-card p-3">
              <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("candidateImport.optionalContactData")}
              </legend>
              <OptToggle
                checked={enrichWorkEmail}
                onChange={setEnrichWorkEmail}
                label={t("candidateImport.workEmail")}
                cost={t("candidateImport.costWorkEmail")}
                disabled={pending}
              />
              <OptToggle
                checked={enrichPersonalEmail}
                onChange={setEnrichPersonalEmail}
                label={t("candidateImport.personalEmail")}
                cost={t("candidateImport.costPersonalEmail")}
                disabled={pending}
              />
              <OptToggle
                checked={enrichPhone}
                onChange={setEnrichPhone}
                label={t("candidateImport.phone")}
                cost={t("candidateImport.costPhone")}
                disabled={pending}
              />
            </fieldset>

            <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
              <span className="text-muted-foreground">
                {urls.length === 0 ? (
                  t("candidateImport.pasteUrlsForCost")
                ) : (
                  <>
                    {t("candidateImport.estimatedCost")}{" "}
                    <span className="font-mono text-foreground">
                      {t("candidateImport.creditsAmount", {
                        amount: totalCost,
                      })}
                    </span>{" "}
                    ({urls.length} × {costPerUrl})
                  </>
                )}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={pending}
                >
                  {t("candidateImport.cancel")}
                </Button>
                <Button
                  onClick={submit}
                  disabled={pending || urls.length === 0}
                  className="gap-1.5"
                >
                  {pending ? (
                    <>
                      <RotateCw className="h-3 w-3 animate-spin" />
                      {t("candidateImport.importing")}
                    </>
                  ) : urls.length > 0 ? (
                    t("candidateImport.importCount", { count: urls.length })
                  ) : (
                    t("candidateImport.import")
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <ResultsView
            results={results}
            onReset={reset}
            onClose={onClose}
            t={t}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OptToggle({
  checked,
  onChange,
  label,
  cost,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  cost: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-3.5 w-3.5"
      />
      <span className="flex-1">{label}</span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {cost}
      </span>
    </label>
  );
}

function ResultsView({
  results,
  onReset,
  onClose,
  t,
}: {
  results: EnrichResultItem[];
  onReset: () => void;
  onClose: () => void;
  t: TFunction;
}) {
  return (
    <div className="space-y-3">
      <ul className="max-h-[50vh] space-y-1 overflow-y-auto rounded-md border border-border bg-card p-2 text-sm">
        {results.map((r, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded px-2 py-1.5"
          >
            {r.kind === "created" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" />
            ) : r.kind === "reused" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
            )}
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate text-xs",
                  r.kind === "error" && "text-danger",
                )}
              >
                {r.kind === "error"
                  ? r.url
                  : r.name || r.url}
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {r.kind === "created"
                  ? t("candidateImport.resultCreated")
                  : r.kind === "reused"
                    ? t("candidateImport.resultReused")
                    : r.error}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={onReset}>
          {t("candidateImport.importMore")}
        </Button>
        <Button onClick={onClose}>{t("candidateImport.close")}</Button>
      </div>
    </div>
  );
}
