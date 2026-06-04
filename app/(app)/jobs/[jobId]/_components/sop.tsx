"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, useLocale } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { toggleSopItemAction } from "../../../actions";
import {
  SOP_PHASES,
  SOP_TEMPLATE,
  type SopItem,
  type SopPhaseKey,
} from "@/lib/sop/template";

/**
 * The vacante-level SOP — Talental's company-wide playbook for working
 * a role end-to-end. Items come from the static template in
 * `lib/sop/template.ts`; checked-state is per-job and lives in
 * hiring.tasks rows (one row per template item, joined back by the
 * `sop:v1 | item: ID` marker the page seeded).
 *
 * Orphan template items (no DB row yet, e.g. a step added to the
 * template after the job was seeded) render as disabled — the page
 * normally seeds everything on load, so this only shows in the brief
 * window before the first revalidation.
 */
export type SopTaskRow = {
  /** hiring.tasks row id — what we toggle. */
  id: string;
  /** Template item id parsed from the marker comment in `body`. */
  itemId: string;
  done: boolean;
};

export function Sop({
  rowsByItemId,
}: {
  /** Map template-item-id → DB task row. Missing keys mean the seed
   *  pass hasn't run yet (rare). */
  rowsByItemId: Record<string, SopTaskRow>;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  function isDone(item: SopItem) {
    const row = rowsByItemId[item.id];
    if (!row) return false;
    return optimistic[row.id] ?? row.done;
  }

  function labelFor(item: SopItem) {
    return locale === "en" ? item.labelEn : item.labelEs;
  }

  const groups = useMemo(() => {
    return SOP_PHASES.map((phase) => {
      const list = SOP_TEMPLATE.filter((it) => it.phase === phase.key);
      return { phase, list };
    }).filter((g) => g.list.length > 0);
  }, []);

  const total = SOP_TEMPLATE.length;
  const doneCount = SOP_TEMPLATE.reduce(
    (n, it) => n + (isDone(it) ? 1 : 0),
    0,
  );

  function toggle(item: SopItem) {
    const row = rowsByItemId[item.id];
    if (!row) {
      // Seed hasn't landed yet — refresh to pick it up.
      router.refresh();
      return;
    }
    const next = !isDone(item);
    setOptimistic((cur) => ({ ...cur, [row.id]: next }));
    start(async () => {
      const res = await toggleSopItemAction({ taskId: row.id, done: next });
      if (!res.ok) {
        toast.saveFailed(res.error);
        setOptimistic((cur) => ({ ...cur, [row.id]: !next }));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t("sop.hint")}</span>
        <span className="font-mono tabular-nums">
          {doneCount} / {total}
        </span>
      </div>
      <div className="space-y-5">
        {groups.map(({ phase, list }) => (
          <section key={phase.key} className="space-y-1.5">
            <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {locale === "en" ? phase.labelEn : phase.labelEs}
            </h3>
            <ul className="space-y-0.5">
              {list.map((item) => {
                const checked = isDone(item);
                const hasRow = Boolean(rowsByItemId[item.id]);
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50",
                      item.indent === 1 && "pl-6",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(item)}
                      disabled={pending || !hasRow}
                      aria-pressed={checked}
                      aria-label={
                        checked
                          ? t("sop.markOpen")
                          : t("sop.markDone")
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
                      {labelFor(item)}
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
