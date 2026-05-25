"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomFieldDefinitionRow, CustomFieldKind } from "@/lib/hiring";
import {
  createCustomFieldAction,
  updateCustomFieldAction,
} from "../../actions";
import { toSnakeKey } from "../../_lib/slug";

const KINDS: Array<{ value: CustomFieldKind; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "long_text", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "boolean", label: "Sí / No" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Selección única" },
  { value: "multi_select", label: "Selección múltiple" },
  { value: "url", label: "URL" },
  { value: "email", label: "Correo" },
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
  const isEdit = editing !== null;
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [kind, setKind] = useState<CustomFieldKind>("text");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isFilterable, setIsFilterable] = useState(false);
  const [isVisibleInColumns, setIsVisibleInColumns] = useState(false);
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
          options: hasOptions(kind) ? cleanedOptions : undefined,
        });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.actionOk(isEdit ? "Campo actualizado" : "Campo creado");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar campo" : "Nuevo campo personalizado"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Label" required>
            <Input
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              required
              autoFocus
            />
          </FormField>

          <FormField
            label="Key (identificador interno)"
            required
            hint="Solo a-z, 0-9 y _. Inmutable después de crear."
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

          <FormField label="Tipo" required>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as CustomFieldKind)}
              disabled={isEdit}
              className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </FormField>

          {hasOptions(kind) ? (
            <FormField label="Opciones">
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
                      placeholder={`Opción ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setOptions(options.filter((_, j) => j !== i))
                      }
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Quitar"
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
                  Nueva opción
                </button>
              </div>
            </FormField>
          ) : null}

          <FormField label="Descripción">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Opcional — qué representa este campo"
            />
          </FormField>

          <div className="space-y-2 rounded-md border border-border bg-bg-3/40 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Comportamiento
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-medium">Obligatorio</span>
                <span className="block text-xs text-muted-foreground">
                  Bloquea Kickoff / Calibrar hasta que tenga un valor.
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
                <span className="block font-medium">Filtrable</span>
                <span className="block text-xs text-muted-foreground">
                  Aparece en el popover de Filtros de la lista.
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
                <span className="block font-medium">Visible en columnas</span>
                <span className="block text-xs text-muted-foreground">
                  Disponible como columna toggleable en la tabla.
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

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Guardar" : "Crear campo"}
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
