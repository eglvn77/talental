"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { calibrateSectionAction } from "@/app/(app)/actions";

/**
 * Per-section "calibrate with a prompt" button. Sits above every
 * Paquete tab's editor. Click → small dialog with a free-text
 * textarea → server action runs Claude against ONLY that section
 * with the recruiter's instruction, writes the result back, and
 * refreshes the page.
 *
 * Lighter than the global /calibrate (which regenerates the whole
 * package). Use this for surgical edits like:
 *   - "Make the script more conversational"
 *   - "Drop the must about 5 years; turn it into a nice"
 *   - "Tweak the outreach to mention the comp range"
 */
export function CalibrateSectionButton({
  jobId,
  section,
  sectionLabel,
}: {
  jobId: string;
  /** Matches SectionKey in lib/kickoff/calibrate-section.ts. */
  section: string;
  /** Human label embedded in the dialog title ("Requirements"). */
  sectionLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!prompt.trim()) return;
    start(async () => {
      const res = await calibrateSectionAction({
        jobId,
        section,
        prompt: prompt.trim(),
      });
      if (!res.ok) {
        toast.actionFailed("Calibrate", res.error);
        return;
      }
      toast.actionOk(`${sectionLabel} updated`);
      setOpen(false);
      setPrompt("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Calibrate ${sectionLabel} with a prompt`}
        aria-label={`Calibrate ${sectionLabel}`}
        className="btn-ai inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Calibrate
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl">
            <h2 className="mb-1 text-sm font-semibold">
              Calibrate {sectionLabel}
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Describe how you want this section changed. The AI rewrites
              only this section.
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              autoFocus
              rows={5}
              disabled={pending}
              placeholder={`e.g. "Drop the must about 5 years; turn it into a nice. Add a must about leading cross-functional teams."`}
              className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !prompt.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Calibrating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Calibrate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
