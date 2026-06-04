"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { updateCandidateContactAction } from "@/app/(app)/_actions/candidate-profile";

/**
 * Inline-editable "Candidate Report" block. Markdown-ish plain text
 * for now (no rich-text toolbar) — the recruiter's own summary of the
 * candidate that gets surfaced in the client portal.
 *
 * Autosaves on blur with a small "Saved" flash. No save button — same
 * UX as the contact inspector and company slideover.
 */
export function CandidateReportEditor({
  candidateId,
  initial,
}: {
  candidateId: string;
  initial: string | null;
}) {
  const t = useT();
  const [value, setValue] = useState(initial ?? "");
  const lastSaved = useRef(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (saving) return;
    setValue(initial ?? "");
    lastSaved.current = initial ?? "";
  }, [initial, saving]);

  async function commit() {
    const next = value.trim();
    if (next === lastSaved.current.trim()) return;
    setSaving(true);
    const res = await updateCandidateContactAction({
      candidateId,
      patch: { candidate_report: next || null },
    });
    setSaving(false);
    if (!res.ok) {
      toast.actionFailed(t("candidatesArea.candidateReportSaveFailed"), res.error);
      setValue(lastSaved.current);
      return;
    }
    lastSaved.current = next;
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 900);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("candidatesArea.candidateReportTitle")}
        </h3>
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : savedFlash ? (
          <Check className="h-3 w-3 text-positive" />
        ) : null}
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        rows={6}
        placeholder={t("candidatesArea.candidateReportPlaceholder")}
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-foreground/30 focus:outline-none"
      />
      <p className="text-[10px] text-muted-foreground">
        {t("candidatesArea.candidateReportHint")}
      </p>
    </div>
  );
}
