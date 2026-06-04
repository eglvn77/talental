"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Loader2, Plus, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  DEFAULT_OPTION_COLOR,
  normalizeOptions,
  type OptionItem,
} from "@/lib/custom-fields-options";

/** OptionItem augmented with a stable client-only id for dnd-kit. The
 *  id never persists — we strip it before submitting to the server. */
type DraftOption = OptionItem & { _id: string };
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
  const [isVisibleInPortal, setIsVisibleInPortal] = useState(false);
  const [options, setOptions] = useState<DraftOption[]>([]);
  // Monotonic id source — refs survive renders without re-firing
  // effects, so adding/removing options doesn't churn drag identity.
  const idCounter = useRef(0);
  function freshId() {
    return `o${++idCounter.current}`;
  }
  function withIds(raw: OptionItem[]): DraftOption[] {
    return raw.map((o) => ({ ...o, _id: freshId() }));
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = options.findIndex((o) => o._id === active.id);
    const to = options.findIndex((o) => o._id === over.id);
    if (from === -1 || to === -1) return;
    setOptions(arrayMove(options, from, to));
  }
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
      setIsVisibleInPortal(
        (editing as { is_visible_in_portal?: boolean })
          .is_visible_in_portal ?? false,
      );
      setOptions(withIds(normalizeOptions(editing.options)));
    } else {
      setLabel("");
      setKey("");
      setKeyTouched(false);
      setKind("text");
      setDescription("");
      setIsRequired(false);
      setIsFilterable(false);
      setIsVisibleInColumns(false);
      setIsVisibleInPortal(false);
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
    // Strip the client-only _id; the persisted shape is the canonical
    // OptionItem array. Trim values and drop empties, preserving the
    // user-chosen order (which now also drives table sort).
    const cleanedOptions: OptionItem[] = options
      .map((o) => ({ value: o.value.trim(), color: o.color }))
      .filter((o) => o.value.length > 0);
    const res = isEdit
      ? await updateCustomFieldAction({
          id: editing!.id,
          label,
          kind,
          description,
          isRequired,
          isFilterable,
          isVisibleInColumns,
          isVisibleInPortal,
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
          isVisibleInPortal,
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
                {/* Drag to reorder. The order here becomes the order
                    used by table sorts on this field (see
                    custom-field-sort.ts → select branch) and the
                    order shown in every dropdown across the app. */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={options.map((o) => o._id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {options.map((opt, i) => (
                      <SortableOptionRow
                        key={opt._id}
                        opt={opt}
                        index={i}
                        onChangeColor={(color) => {
                          const next = [...options];
                          next[i] = { ...next[i]!, color };
                          setOptions(next);
                        }}
                        onChangeValue={(value) => {
                          const next = [...options];
                          next[i] = { ...next[i]!, value };
                          setOptions(next);
                        }}
                        onRemove={() =>
                          setOptions(options.filter((_, j) => j !== i))
                        }
                        colorAriaLabel={t("customFieldsCfg.optionColor")}
                        placeholder={t("customFieldsCfg.optionPlaceholder", {
                          n: i + 1,
                        })}
                        removeAriaLabel={t("customFieldsCfg.removeOption")}
                        reorderAriaLabel={t("customFieldsCfg.reorderOption")}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <button
                  type="button"
                  onClick={() =>
                    setOptions([
                      ...options,
                      { value: "", color: DEFAULT_OPTION_COLOR, _id: freshId() },
                    ])
                  }
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
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isVisibleInPortal}
                onChange={(e) => setIsVisibleInPortal(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-medium">
                  {t("customFieldsCfg.visibleInPortal")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("customFieldsCfg.visibleInPortalHint")}
                </span>
              </span>
            </label>
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

/** One draggable row inside the Options list. Pulled into its own
 *  component because useSortable() needs a stable element instance
 *  per item — defining it inline inside the map would lose the dnd
 *  hooks on every parent re-render. */
function SortableOptionRow({
  opt,
  index,
  onChangeColor,
  onChangeValue,
  onRemove,
  colorAriaLabel,
  placeholder,
  removeAriaLabel,
  reorderAriaLabel,
}: {
  opt: DraftOption;
  index: number;
  onChangeColor: (color: string) => void;
  onChangeValue: (value: string) => void;
  onRemove: () => void;
  colorAriaLabel: string;
  placeholder: string;
  removeAriaLabel: string;
  reorderAriaLabel: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: opt._id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  void index;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={reorderAriaLabel}
        className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <input
        type="color"
        value={opt.color ?? DEFAULT_OPTION_COLOR}
        onChange={(e) => onChangeColor(e.target.value)}
        aria-label={colorAriaLabel}
        title={colorAriaLabel}
        className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5"
      />
      <Input
        value={opt.value}
        onChange={(e) => onChangeValue(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={removeAriaLabel}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
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
  // Render as <div>, not <label>: an implicit <label> wrapping multiple
  // controls forwards every click to the first one inside, which made
  // clicking empty space in the Options field open the first option's
  // <input type="color"> picker. Visible label text stays.
  return (
    <div className="block">
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
    </div>
  );
}
