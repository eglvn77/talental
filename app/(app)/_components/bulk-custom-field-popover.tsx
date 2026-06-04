"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronLeft, Pencil, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeOptions } from "@/lib/custom-fields-options";
import { bulkUpdateCustomFieldValueAction } from "../settings/actions";

/**
 * Floating popover dropped into a table's BulkActionsBar. Lets the
 * user pick one custom field definition and apply a single value (or
 * clear) to every selected row in one round-trip. The value input
 * adapts to the field's kind — select dropdown, multi-select
 * checkboxes, date input, boolean radio, plain text/number/url/email.
 *
 * Pure UI; the parent owns the selection set and a callback that
 * runs after a successful write (clear selection + router refresh).
 */

type Definition = {
  id: string;
  key: string;
  label: string;
  kind: string;
  options: unknown;
};

export function BulkCustomFieldPopover({
  selectedIds,
  definitions,
  onDone,
}: {
  selectedIds: Set<string>;
  definitions: Definition[];
  onDone: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pickedDefId, setPickedDefId] = useState<string | null>(null);
  const [, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Filter to editable kinds. Long_text could be edited too but for
  // bulk that's almost always a mistake (pasting the same paragraph
  // into 30 rows), so we skip it for now.
  const editableDefs = useMemo(
    () =>
      definitions.filter((d) =>
        [
          "text",
          "number",
          "date",
          "boolean",
          "select",
          "multi_select",
          "url",
          "email",
        ].includes(d.kind),
      ),
    [definitions],
  );

  useEffect(() => {
    if (!open) {
      setPickedDefId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function apply(value: unknown) {
    if (!pickedDefId || selectedIds.size === 0) return;
    start(async () => {
      const res = await bulkUpdateCustomFieldValueAction({
        definitionId: pickedDefId,
        entityIds: [...selectedIds],
        value,
      });
      if (!res.ok) {
        toast.actionFailed(t("bulkField.applyFailed"), res.error);
        return;
      }
      toast.actionOk(
        t("bulkField.applied", { count: res.data.updated }),
      );
      setOpen(false);
      onDone();
    });
  }

  const pickedDef = editableDefs.find((d) => d.id === pickedDefId) ?? null;

  // Nothing editable in this workspace? Don't render the trigger at all.
  if (editableDefs.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-fg-1 transition-colors hover:bg-bg-3"
      >
        <Pencil className="h-3.5 w-3.5" />
        {t("bulkField.trigger")}
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-md border border-border bg-background shadow-modal">
          {!pickedDef ? (
            <DefPicker
              defs={editableDefs}
              onPick={(id) => setPickedDefId(id)}
            />
          ) : (
            <ValueEditor
              def={pickedDef}
              onBack={() => setPickedDefId(null)}
              onApply={apply}
              onClear={() => apply(null)}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function DefPicker({
  defs,
  onPick,
}: {
  defs: Definition[];
  onPick: (id: string) => void;
}) {
  const t = useT();
  return (
    <>
      <div className="border-b border-border px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("bulkField.pickField")}
      </div>
      <ul className="max-h-64 overflow-y-auto py-1">
        {defs.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onPick(d.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className="truncate">{d.label}</span>
              <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                {d.kind}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ValueEditor({
  def,
  onBack,
  onApply,
  onClear,
}: {
  def: Definition;
  onBack: () => void;
  onApply: (value: unknown) => void;
  onClear: () => void;
}) {
  const t = useT();
  const options = useMemo(() => normalizeOptions(def.options), [def.options]);
  const [text, setText] = useState("");
  const [num, setNum] = useState("");
  const [date, setDate] = useState("");
  const [bool, setBool] = useState<"true" | "false">("true");
  const [multi, setMulti] = useState<Set<string>>(new Set());

  function commit() {
    switch (def.kind) {
      case "text":
      case "long_text":
      case "email":
      case "url":
        onApply(text.trim() || null);
        return;
      case "number": {
        const n = num.trim() === "" ? null : Number(num);
        onApply(n === null || Number.isNaN(n) ? null : n);
        return;
      }
      case "date":
        onApply(date || null);
        return;
      case "boolean":
        onApply(bool === "true");
        return;
      case "multi_select":
        onApply(multi.size === 0 ? null : [...multi]);
        return;
      default:
        return;
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <button
          type="button"
          onClick={onBack}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("common.back")}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="truncate text-xs font-medium">{def.label}</span>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        {/* select renders its options inline as a list — fastest
            interaction. The other kinds use a form-style input + Apply
            button below. */}
        {def.kind === "select" ? (
          <ul className="max-h-56 overflow-y-auto rounded-md border border-border">
            {options.length === 0 ? (
              <li className="px-3 py-2 text-[11px] text-muted-foreground">
                {t("bulkField.noOptions")}
              </li>
            ) : (
              options.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => onApply(o.value)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: o.color ?? "#807866" }}
                    />
                    <span className="truncate">{o.value}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : def.kind === "multi_select" ? (
          <ul className="max-h-56 overflow-y-auto rounded-md border border-border py-1">
            {options.map((o) => {
              const checked = multi.has(o.value);
              return (
                <li key={o.value}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(multi);
                        if (checked) next.delete(o.value);
                        else next.add(o.value);
                        setMulti(next);
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate">{o.value}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : def.kind === "boolean" ? (
          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input
                type="radio"
                name="bulk-bool"
                checked={bool === "true"}
                onChange={() => setBool("true")}
                className="sr-only"
              />
              {t("bulkField.boolTrue")}
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input
                type="radio"
                name="bulk-bool"
                checked={bool === "false"}
                onChange={() => setBool("false")}
                className="sr-only"
              />
              {t("bulkField.boolFalse")}
            </label>
          </div>
        ) : def.kind === "number" ? (
          <Input
            type="number"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            placeholder="0"
            autoFocus
          />
        ) : def.kind === "date" ? (
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            autoFocus
          />
        ) : (
          <Input
            type={def.kind === "email" ? "email" : def.kind === "url" ? "url" : "text"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={def.label}
            autoFocus
          />
        )}
        {/* Apply / Clear footer — select kind already applies on
            click, so it skips the footer entirely. */}
        {def.kind !== "select" ? (
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={onClear}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <X className="h-3 w-3" />
              {t("bulkField.clear")}
            </button>
            <Button
              type="button"
              size="sm"
              onClick={commit}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              {t("bulkField.apply")}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
