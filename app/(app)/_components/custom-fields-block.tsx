"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import type {
  CustomFieldDefinitionRow,
  CustomFieldKind,
} from "@/lib/hiring";
import { upsertCustomFieldValueAction } from "@/app/(app)/settings/actions";

const TEXT_LIKE: CustomFieldKind[] = ["text", "long_text", "url", "email"];

export function CustomFieldsBlock({
  entityId,
  definitions,
  initialValues,
}: {
  entityId: string;
  definitions: CustomFieldDefinitionRow[];
  initialValues: Record<string, unknown>;
}) {
  if (definitions.length === 0) return null;
  return (
    <div className="space-y-3">
      {definitions.map((d) => (
        <FieldEditor
          key={d.id}
          definition={d}
          entityId={entityId}
          initialValue={initialValues[d.id]}
        />
      ))}
    </div>
  );
}

function FieldEditor({
  definition,
  entityId,
  initialValue,
}: {
  definition: CustomFieldDefinitionRow;
  entityId: string;
  initialValue: unknown;
}) {
  const [value, setValue] = useState<unknown>(initialValue ?? defaultFor(definition));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function persist(next: unknown) {
    setSaved(false);
    startTransition(async () => {
      const res = await upsertCustomFieldValueAction({
        definitionId: definition.id,
        entityId,
        value: next,
      });
      if (!res.ok) {
        toast.saveFailed(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    });
  }

  function commit(next: unknown) {
    setValue(next);
    persist(next);
  }

  function commitOnBlur() {
    persist(value);
  }

  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {definition.label}
        {definition.is_required ? (
          <span className="text-amber-600">*</span>
        ) : null}
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />
        ) : saved ? (
          <Check className="h-3 w-3 text-positive" />
        ) : null}
      </span>
      <div className="mt-1">
        <Input
          definition={definition}
          value={value}
          onChange={setValue}
          onCommit={commit}
          onBlurCommit={commitOnBlur}
          disabled={pending}
        />
      </div>
      {definition.description ? (
        <span className="mt-1 block text-[10px] text-muted-foreground">
          {definition.description}
        </span>
      ) : null}
    </label>
  );
}

function defaultFor(d: CustomFieldDefinitionRow): unknown {
  switch (d.kind) {
    case "boolean":
      return false;
    case "multi_select":
      return [];
    default:
      return "";
  }
}

function Input({
  definition,
  value,
  onChange,
  onCommit,
  onBlurCommit,
  disabled,
}: {
  definition: CustomFieldDefinitionRow;
  value: unknown;
  onChange: (v: unknown) => void;
  onCommit: (v: unknown) => void;
  onBlurCommit: () => void;
  disabled: boolean;
}) {
  const kind = definition.kind;
  const baseInput =
    "h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm";

  if (TEXT_LIKE.includes(kind) && kind !== "long_text") {
    const type =
      kind === "email" ? "email" : kind === "url" ? "url" : "text";
    return (
      <input
        type={type}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlurCommit}
        disabled={disabled}
        className={baseInput}
      />
    );
  }

  if (kind === "long_text") {
    return (
      <textarea
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlurCommit}
        disabled={disabled}
        rows={3}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />
    );
  }

  if (kind === "number") {
    return (
      <input
        type="number"
        value={value === null || value === undefined || value === "" ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
        onBlur={onBlurCommit}
        disabled={disabled}
        className={baseInput}
      />
    );
  }

  if (kind === "boolean") {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onCommit(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4"
        />
        <span className="text-muted-foreground">Sí</span>
      </label>
    );
  }

  if (kind === "date") {
    return (
      <input
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onCommit(e.target.value)}
        disabled={disabled}
        className={baseInput}
      />
    );
  }

  if (kind === "select") {
    const options = definition.options ?? [];
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onCommit(e.target.value)}
        disabled={disabled}
        className={baseInput}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (kind === "multi_select") {
    const options = definition.options ?? [];
    const current = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 ? (
          <span className="text-xs italic text-muted-foreground">
            Sin opciones definidas
          </span>
        ) : (
          options.map((o) => {
            const active = current.includes(o);
            return (
              <button
                key={o}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = active
                    ? current.filter((x) => x !== o)
                    : [...current, o];
                  onCommit(next);
                }}
                className={
                  active
                    ? "rounded-full bg-accent px-2 py-0.5 text-xs text-fg-on-accent"
                    : "rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                }
              >
                {o}
              </button>
            );
          })
        )}
      </div>
    );
  }

  return null;
}
