"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  DEFAULT_OPTION_COLOR,
  normalizeOptions,
} from "@/lib/custom-fields-options";
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
  onLocalChange,
  deferred = false,
}: {
  entityId: string;
  definitions: CustomFieldDefinitionRow[];
  initialValues: Record<string, unknown>;
  /**
   * Fires every time a field's local value changes (typing into a
   * text input, toggling a select, etc). Lets a parent shell (e.g.
   * the Kickoff dialog) reactively gate submit on whether all
   * required fields now hold a non-empty value, without waiting for
   * the on-blur autosave to round-trip.
   */
  onLocalChange?: (definitionId: string, value: unknown) => void;
  /**
   * Deferred mode: the entity doesn't exist yet (e.g. the create-job
   * modal). Fields never autosave — they only emit via `onLocalChange`
   * so the parent can batch-persist after creating the entity.
   */
  deferred?: boolean;
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
          onLocalChange={onLocalChange}
          deferred={deferred}
        />
      ))}
    </div>
  );
}

function FieldEditor({
  definition,
  entityId,
  initialValue,
  onLocalChange,
  deferred = false,
}: {
  definition: CustomFieldDefinitionRow;
  entityId: string;
  initialValue: unknown;
  onLocalChange?: (definitionId: string, value: unknown) => void;
  deferred?: boolean;
}) {
  const [value, setValue] = useState<unknown>(initialValue ?? defaultFor(definition));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Mirror the local value up to the parent on every change so it
  // can gate parent-level submit logic without waiting for the
  // server-roundtripping autosave.
  function emitLocal(next: unknown) {
    setValue(next);
    onLocalChange?.(definition.id, next);
  }

  function persist(next: unknown) {
    // Deferred: the entity doesn't exist yet; the parent collects the
    // value via onLocalChange and persists after creating it.
    if (deferred) return;
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
    emitLocal(next);
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
          onChange={emitLocal}
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
  const t = useT();
  const kind = definition.kind;
  // Cap form-field width consistently across the app. Tokens:
  //   FIELD_W_MD  — text, email, url, select  (~448 px)
  //   FIELD_W_SM  — number, date              (~200 px)
  //   FIELD_W_LG  — long_text textarea        (~672 px)
  // Anything below `max-w-*` still flexes down on narrow screens.
  const FIELD_W_MD = "max-w-md";
  const FIELD_W_SM = "max-w-[200px]";
  const FIELD_W_LG = "max-w-2xl";
  const baseInput = `h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm`;

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
        className={`${baseInput} ${FIELD_W_MD}`}
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
        className={`w-full ${FIELD_W_LG} rounded-md border border-border bg-background px-2.5 py-1.5 text-sm`}
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
        className={`${baseInput} ${FIELD_W_SM}`}
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
        <span className="text-muted-foreground">{t("shared.customFieldYes")}</span>
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
        className={`${baseInput} ${FIELD_W_SM}`}
      />
    );
  }

  if (kind === "select") {
    const options = normalizeOptions(definition.options);
    return (
      <Select
        value={typeof value === "string" ? value : ""}
        onChange={(v) => onCommit(v)}
        disabled={disabled}
        className={FIELD_W_MD}
        placeholder="—"
        searchable={options.length > 5}
        options={options.map((o) => ({
          value: o.value,
          label: formatOptionLabel(definition.key, o.value),
        }))}
      />
    );
  }

  if (kind === "multi_select") {
    const options = normalizeOptions(definition.options);
    const current = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 ? (
          <span className="text-xs italic text-muted-foreground">
            {t("shared.customFieldNoOptions")}
          </span>
        ) : (
          options.map((o) => {
            const active = current.includes(o.value);
            const color = o.color ?? DEFAULT_OPTION_COLOR;
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = active
                    ? current.filter((x) => x !== o.value)
                    : [...current, o.value];
                  onCommit(next);
                }}
                className="rounded-full px-2 py-0.5 text-xs transition-colors"
                style={
                  active
                    ? { background: color, color: "var(--fg-on-accent)" }
                    : {
                        background: `${color}22`,
                        color,
                        border: `1px solid ${color}33`,
                      }
                }
              >
                {formatOptionLabel(definition.key, o.value)}
              </button>
            );
          })
        )}
      </div>
    );
  }

  return null;
}

/**
 * Human-friendly labels for select/multi-select option values that
 * the user shouldn't see as raw snake_case (AI-readable contract
 * values). Per-key overrides for the system-managed defs; everything
 * else falls back to a generic title-case humanizer so workspace-
 * defined options stay legible too.
 */
const OPTION_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  role_type: {
    full_headhunting: "Full Headhunting",
    hybrid_ai_hunting: "Hybrid AI + Hunting",
    inbound_ai_driven: "Inbound AI Driven",
  },
};

function formatOptionLabel(definitionKey: string, value: string): string {
  const override = OPTION_LABEL_OVERRIDES[definitionKey]?.[value];
  if (override) return override;
  // Generic fallback: split snake/kebab into words, title-case each.
  // Skip the humanizer when the value already looks like prose so we
  // don't mangle workspace-defined options like "México" or "Senior".
  if (/\s/.test(value)) return value;
  return value
    .split(/[_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
