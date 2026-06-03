"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { upsertCustomFieldValueAction } from "@/app/(app)/settings/actions";
import {
  DEFAULT_OPTION_COLOR,
  type OptionItem,
} from "@/lib/custom-fields-options";

/**
 * Minimalist inline editor for select-type custom-field cells. Renders
 * as a pill (no border by default) with a chevron — same affordance as
 * the workspace status select. The fill color comes from the chosen
 * option's color (#xxxxxx tinted at ~13% for the chip background, the
 * full color for the text). When no option is selected, the pill is a
 * muted "— No value —" with the neutral stone color.
 *
 * Click → popover with all options. Select → optimistic update +
 * upsertCustomFieldValueAction. Errors revert the optimistic state.
 */
export function InlineSelectCell({
  definitionId,
  entityId,
  initialValue,
  options,
}: {
  definitionId: string;
  entityId: string;
  initialValue: string;
  /** Normalized option list (see lib/custom-fields-options.ts). */
  options: OptionItem[];
}) {
  const t = useT();
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setValue(initialValue), [initialValue]);

  // Close on outside click. The popover is rendered inside the same
  // root so this catches every off-pill click (including elsewhere in
  // the table row, which is what the user expects).
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function commit(next: string) {
    if (next === value) {
      setOpen(false);
      return;
    }
    const prior = value;
    setValue(next);
    setOpen(false);
    start(async () => {
      const res = await upsertCustomFieldValueAction({
        definitionId,
        entityId,
        value: next || null,
      });
      if (!res.ok) {
        toast.saveFailed(res.error);
        setValue(prior);
      }
    });
  }

  const current = options.find((o) => o.value === value);
  const color = current?.color ?? DEFAULT_OPTION_COLOR;
  const isEmpty = !current;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
          isEmpty && "text-muted-foreground hover:bg-muted",
        )}
        style={
          isEmpty
            ? undefined
            : { background: `${color}22`, color }
        }
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
        {isEmpty ? t("shared.clearValue") : current.value}
        <ChevronDown className="ml-0.5 h-3 w-3" />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] overflow-hidden rounded-md border border-border bg-background py-1 shadow-dropdown"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => commit("")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted"
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: DEFAULT_OPTION_COLOR }}
            />
            {t("shared.clearValue")}
          </button>
          {options.map((o) => {
            const c = o.color ?? DEFAULT_OPTION_COLOR;
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => commit(o.value)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-muted",
                  active && "font-medium",
                )}
                style={{ color: c }}
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: c }}
                />
                {o.value}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
