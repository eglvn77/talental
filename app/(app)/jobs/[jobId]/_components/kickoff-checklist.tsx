"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { toggleKickoffTaskAction } from "../../../actions";
import type { ChecklistItem } from "../paquete/page";

/**
 * Renders the kickoff checklist tasks grouped by phase. Items are
 * persisted as hiring.tasks rows; toggling a checkbox flips status
 * open ↔ done via toggleKickoffTaskAction. Optimistic update: the
 * local list reflects the new state immediately and the server call
 * runs in a transition.
 */
export function KickoffChecklist({ items }: { items: ChecklistItem[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  function isDone(it: ChecklistItem) {
    return optimistic[it.id] ?? it.done;
  }

  // Group by phase preserving server order (the prompt emits phases
  // in a meaningful sequence: Retainer Payment → Role Kickoff →
  // Calibration → …). Within each phase, completed items drop to the
  // bottom so the recruiter focuses on outstanding work first.
  const groups = useMemo(() => {
    const seen = new Map<string, ChecklistItem[]>();
    for (const it of items) {
      const arr = seen.get(it.phase) ?? [];
      arr.push(it);
      seen.set(it.phase, arr);
    }
    return Array.from(seen.entries()).map(([phase, list]) => {
      // Stable partition: pending first, done last, preserving the
      // original index within each partition (so prompt ordering still
      // reads naturally for the pending items).
      const ordered = list
        .map((it, i) => ({ it, i, done: optimistic[it.id] ?? it.done }))
        .sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1;
          return a.i - b.i;
        })
        .map((x) => x.it);
      return { phase, list: ordered };
    });
  }, [items, optimistic]);

  const total = items.length;
  const doneCount = items.reduce((n, it) => n + (isDone(it) ? 1 : 0), 0);

  function toggle(it: ChecklistItem) {
    const next = !isDone(it);
    setOptimistic((cur) => ({ ...cur, [it.id]: next }));
    start(async () => {
      const res = await toggleKickoffTaskAction({ taskId: it.id, done: next });
      if (!res.ok) {
        toast.saveFailed(res.error);
        // Roll back the optimistic flip.
        setOptimistic((cur) => ({ ...cur, [it.id]: !next }));
        return;
      }
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("kickoff.checklistEmpty")}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t("kickoff.checklistHint")}</span>
        <span className="font-mono tabular-nums">
          {doneCount} / {total}
        </span>
      </div>
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.phase} className="space-y-1.5">
            <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {g.phase}
            </h3>
            <ul className="space-y-0.5">
              {g.list.map((it) => {
                const checked = isDone(it);
                return (
                  <li
                    key={it.id}
                    className={cn(
                      "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50",
                      it.indent === 1 && "pl-6",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(it)}
                      disabled={pending}
                      aria-pressed={checked}
                      aria-label={
                        checked
                          ? t("kickoff.checklistMarkOpen")
                          : t("kickoff.checklistMarkDone")
                      }
                      className={cn(
                        "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked
                          ? "border-accent bg-accent text-fg-on-accent"
                          : "border-border bg-background hover:border-accent",
                      )}
                    >
                      {checked ? <Check className="h-3 w-3" /> : null}
                    </button>
                    <span
                      className={cn(
                        "min-w-0 flex-1",
                        checked && "text-muted-foreground line-through",
                      )}
                    >
                      {it.title}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
