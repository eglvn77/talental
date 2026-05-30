"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CustomFieldDefinitionRow, CustomFieldKind } from "@/lib/hiring";
import {
  createCustomFieldAction,
  updateCustomFieldAction,
} from "../../actions";
import { toSnakeKey } from "../../_lib/slug";

const KIND_VALUES: CustomFieldKind[] = [
  "text",
  "long_text",
  "number",
  "boolean",
  "date",
  "select",
  "multi_select",
  "url",
  "email",
];

function hasOptions(kind: CustomFieldKind) {
  return kind === "select" || kind === "multi_select";
}

export function FieldForm({
  entity,
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  entity: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CustomFieldDefinitionRow | null;
  onSaved: () => void;
}) {
  const t = useT();
  const isEdit = editing !== null;
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [kind, setKind] = useState<CustomFieldKind>("text");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isFilterable, setIsFilterable] = useState(false);
  const [isVisibleInColumns, setIsVisibleInColumns] = useState(false);
  const [showInPostings, setShowInPostings] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setLabel(editing.label);
      setKey(editing.key);
      setKeyTouched(true);
      setKind(editing.kind);
      setDescription(editing.description ?? "");
      setIsRequired(editing.is_required);
      setIsFilterable(editing.is_filterable ?? false);
      setIsVisibleInColumns(editing.is_visible_in_columns ?? false);
      setShowInPostings(editing.show_in_postings ?? false);
      setOptions(editing.options ?? []);
    } else {
      setLabel("");
      setKey("");
      setKeyTouched(false);
      setKind("text");
      setDescription("");
      setIsRequired(false);
      setIsFilterable(false);
      setIsVisibleInColumns(false);
      setShowInPostings(false);
      setOptions([]);
    }
    setError(null);
  }, [open, editing]);

  function handleLabelChange(v: string) {
    setLabel(v);
    if (!keyTouched && !isEdit) setKey(toSnakeKey(v));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const cleanedOptions = options
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    const res = isEdit
      ? await updateCustomFieldAction({
          id: editing!.id,
          label,
          kind,
          description,
          isRequired,
          isFilterable,
          isVisibleInColumns,
          showInPostings,
          options: hasOptions(kind) ? cleanedOptions : undefined,
        })
      : await createCustomFieldAction({
          entityType: entity,
          key,
          label,
          kind,
          description,
          isRequired,
          isFilterable,
          isVisibleInColumns,
          showInPostings,
          options: hasOptions(kind) ? cleanedOptions : undefined,
        });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.actionOk(
      isEdit
        ? t("customFieldsCfg.toastUpdated")
        : t("customFieldsCfg.toastCreated"),
    );
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Dialog wrapper switches to flex-col with zero padding so the
          inner form can split into a scrollable body + a sticky
          footer. Without this the form overflowed the dialog's
          85vh cap and the Guardar button got pushed off-screen with
          no way to reach it. Same pattern as the template editor
          dialog in /settings/processes. */}
      <DialogContent className="flex max-h-[85vh] w-full max-w-xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3.5">
          <DialogTitle className="text-base">
            {isEdit
              ? t("customFieldsCfg.editTitle")
              : t("customFieldsCfg.newTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <FormField label={t("customFieldsCfg.fieldLabel")} required>
            <Input
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              required
              autoFocus
            />
          </FormField>

          <FormField
            label={t("customFieldsCfg.fieldKey")}
            required
            hint={t("customFieldsCfg.fieldKeyHint")}
          >
            <Input
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyTouched(true);
              }}
              required
              disabled={isEdit}
              className="font-mono text-xs"
            />
          </FormField>

          <FormField
            label={t("customFieldsCfg.fieldType")}
            required
            hint={
              isEdit && !editing?.is_system
                ? t("customFieldsCfg.fieldTypeHint")
                : undefined
            }
          >
            <Select
              value={kind}
              onChange={(v) => setKind(v as CustomFieldKind)}
              // System-managed fields (role_type, assessment_link)
              // lock kind because the AI pipeline reads them by
              // contract. Regular custom fields stay editable on edit
              // — the admin takes responsibility for any value drift.
              disabled={isEdit && Boolean(editing?.is_system)}
              options={KIND_VALUES.map((value) => ({
                value,
                label: t(`customFieldsCfg.kind.${value}`),
              }))}
            />
          </FormField>

          {hasOptions(kind) ? (
            <FormField label={t("customFieldsCfg.options")}>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const next = [...options];
                        next[i] = e.target.value;
                        setOptions(next);
                      }}
                      placeholder={t("customFieldsCfg.optionPlaceholder", {
                        n: i + 1,
                      })}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setOptions(options.filter((_, j) => j !== i))
                      }
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={t("customFieldsCfg.removeOption")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setOptions([...options, ""])}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  {t("customFieldsCfg.newOption")}
                </button>
              </div>
            </FormField>
          ) : null}

          <FormField label={t("customFieldsCfg.description")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder={t("customFieldsCfg.descriptionPlaceholder")}
            />
          </FormField>

          <div className="space-y-2 rounded-md border border-border bg-bg-3/40 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("customFieldsCfg.behavior")}
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-medium">
                  {t("customFieldsCfg.required")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("customFieldsCfg.requiredHint")}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isFilterable}
                onChange={(e) => setIsFilterable(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-medium">
                  {t("customFieldsCfg.filterable")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("customFieldsCfg.filterableHint")}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isVisibleInColumns}
                onChange={(e) => setIsVisibleInColumns(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-medium">
                  {t("customFieldsCfg.visibleInColumns")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("customFieldsCfg.visibleInColumnsHint")}
                </span>
              </span>
            </label>
            {/* Only meaningful on vacantes today — they have a public
                careers page. Hidden for the other entities until we
                ship public-facing surfaces for them. */}
            {entity === "job" ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showInPostings}
                  onChange={(e) => setShowInPostings(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block font-medium">
                    {t("customFieldsCfg.showInPostings")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("customFieldsCfg.showInPostingsHint")}
                  </span>
                </span>
              </label>
            ) : null}
          </div>

            {error ? (
              <p
                role="alert"
                aria-live="polite"
                className="text-xs text-danger"
              >
                {error}
              </p>
            ) : null}
          </div>

          {/* Sticky footer so Guardar / Cancelar are always reachable
              even when the form body scrolls. */}
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t("customFieldsCfg.cancel")}
            </Button>
            <Button type="submit" disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit
                ? t("customFieldsCfg.save")
                : t("customFieldsCfg.createField")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
      {hint ? (
        <span className="mt-1 block text-[10px] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
