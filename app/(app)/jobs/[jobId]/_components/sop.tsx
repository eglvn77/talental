"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, useLocale } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { toggleSopItemAction } from "../../../actions";
import type {
  SopTemplate,
  SopTemplateItem,
  SopTemplatePhase,
} from "@/lib/sop/loader";

/**
 * The vacante-level SOP — Talental's company-wide playbook for working
 * a role end-to-end. Phase 3b-SOP-2: items + phases come from the
 * workspace's `resource_definitions.template_json` for key='sop', and
 * per-job done-state lives in `resource_values.value.checked[]` — no
 * more hiring.tasks rows, no more hardcoded SOP_TEMPLATE.
 *
 * Empty template falls back to a single "configure your SOP" hint.
 */
export function Sop({
  jobId,
  template,
  checked,
}: {
  jobId: string;
  template: SopTemplate;
  /** Set of item-ids currently marked done for this vacante. */
  checked: Set<string>;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  function isDone(item: SopTemplateItem) {
    return optimistic[item.id] ?? checked.has(item.id);
  }

  function labelFor<T extends { label_es: string; label_en: string }>(x: T) {
    return locale === "en" ? x.label_en : x.label_es;
  }

  const groups = useMemo(() => {
    return template.phases
      .map((phase: SopTemplatePhase) => {
        const list = template.items.filter((it) => it.phase === phase.key);
        return { phase, list };
      })
      .filter((g) => g.list.length > 0);
  }, [template]);

  const total = template.items.length;
  const doneCount = template.items.reduce(
    (n, it) => n + (isDone(it) ? 1 : 0),
    0,
  );

  function toggle(item: SopTemplateItem) {
    const next = !isDone(item);
    setOptimistic((cur) => ({ ...cur, [item.id]: next }));
    start(async () => {
      const res = await toggleSopItemAction({
        jobId,
        itemId: item.id,
        done: next,
      });
      if (!res.ok) {
        toast.saveFailed(res.error);
        setOptimistic((cur) => ({ ...cur, [item.id]: !next }));
        return;
      }
      router.refresh();
    });
  }

  if (total === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
        {t("sop.emptyTemplate")}
      </div>
    );
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
              {labelFor(phase)}
            </h3>
            <ul className="space-y-0.5">
              {list.map((item) => {
                const done = isDone(item);
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
                      disabled={pending}
                      aria-pressed={done}
                      aria-label={
                        done ? t("sop.markOpen") : t("sop.markDone")
                      }
                      className={cn(
                        "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        done
                          ? "border-accent bg-accent text-fg-on-accent"
                          : "border-border bg-background hover:border-accent",
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : null}
                    </button>
                    <span
                      className={cn(
                        "min-w-0 flex-1",
                        done && "text-muted-foreground line-through",
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
