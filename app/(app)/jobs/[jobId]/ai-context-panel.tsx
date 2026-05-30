"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import { regenerateApplicationContextAction } from "@/app/(app)/_actions/application-ai";
import type { ApplicationAiNextStep } from "@/lib/hiring";

/**
 * Shows the AI-generated status line + 1-3 next-step suggestions for
 * an application. Refresh button regenerates via Claude (~3-8s).
 *
 * Local state mirrors what the action returns so the panel reflects
 * the new context immediately without a router.refresh().
 */
export function AiContextPanel({
  applicationId,
  initialStatus,
  initialSteps,
  initialUpdatedAt,
}: {
  applicationId: string;
  initialStatus: string | null;
  initialSteps: ApplicationAiNextStep[] | null;
  initialUpdatedAt: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [steps, setSteps] = useState(initialSteps ?? []);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [pending, startTransition] = useTransition();
  const t = useT();

  function refresh() {
    startTransition(async () => {
      const res = await regenerateApplicationContextAction(applicationId);
      if (!res.ok) {
        toast.actionFailed(t("jobDetail.aiContextGenerateFailed"), res.error);
        return;
      }
      setStatus(res.data.status_line);
      setSteps(res.data.next_steps);
      setUpdatedAt(new Date().toISOString());
    });
  }

  const hasContent = status || steps.length > 0;

  return (
    <section
      aria-label={t("jobDetail.aiContextAriaLabel")}
      className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-4"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3 w-3 text-accent" />
          {t("jobDetail.aiContextTitle")}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
          title={hasContent ? t("jobDetail.aiContextRegenerate") : t("jobDetail.aiContextGenerate")}
        >
          <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
          {hasContent ? t("jobDetail.aiContextRefresh") : t("jobDetail.aiContextGenerate")}
        </button>
      </header>

      {pending && !hasContent ? (
        <p className="text-xs text-muted-foreground">{t("jobDetail.aiContextGenerating")}</p>
      ) : !hasContent ? (
        <p className="text-xs text-muted-foreground">
          {t("jobDetail.aiContextEmpty")}
        </p>
      ) : (
        <>
          {status ? (
            <p className="text-sm leading-snug text-foreground">{status}</p>
          ) : null}
          {steps.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <UrgencyDot urgency={s.urgency} />
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">
                      {s.label}
                    </span>
                    {s.hint ? (
                      <span className="ml-1 text-muted-foreground">
                        — {s.hint}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {updatedAt ? (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {t("jobDetail.aiContextUpdated", { time: relativeShort(updatedAt, t) })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function UrgencyDot({ urgency }: { urgency: ApplicationAiNextStep["urgency"] }) {
  const t = useT();
  const cls =
    urgency === "high"
      ? "bg-danger"
      : urgency === "low"
        ? "bg-foreground/30"
        : "bg-accent";
  return (
    <span
      aria-hidden
      className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", cls)}
      title={
        urgency === "high"
          ? t("jobDetail.urgencyHigh")
          : urgency === "low"
            ? t("jobDetail.urgencyLow")
            : t("jobDetail.urgencyNormal")
      }
    />
  );
}

function relativeShort(iso: string, t: TFunction): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return t("jobDetail.relativeNow");
  if (mins < 60) return t("jobDetail.relativeMinutes", { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("jobDetail.relativeHours", { count: hours });
  const days = Math.round(hours / 24);
  return t("jobDetail.relativeDays", { count: days });
}
