"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
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

  function refresh() {
    startTransition(async () => {
      const res = await regenerateApplicationContextAction(applicationId);
      if (!res.ok) {
        toast.actionFailed("No se pudo generar el contexto", res.error);
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
      aria-label="Contexto AI"
      className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-4"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3 w-3 text-accent" />
          Estado y próximos pasos
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
          title={hasContent ? "Regenerar" : "Generar"}
        >
          <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
          {hasContent ? "Actualizar" : "Generar"}
        </button>
      </header>

      {pending && !hasContent ? (
        <p className="text-xs text-muted-foreground">Generando…</p>
      ) : !hasContent ? (
        <p className="text-xs text-muted-foreground">
          Aún no se ha generado. Clic en &quot;Generar&quot; para que el
          asistente analice el contexto y sugiera siguientes pasos.
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
              Actualizado {relativeShort(updatedAt)}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function UrgencyDot({ urgency }: { urgency: ApplicationAiNextStep["urgency"] }) {
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
          ? "Urgencia alta"
          : urgency === "low"
            ? "Urgencia baja"
            : "Urgencia normal"
      }
    />
  );
}

function relativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.round(hours / 24);
  return `hace ${days}d`;
}
