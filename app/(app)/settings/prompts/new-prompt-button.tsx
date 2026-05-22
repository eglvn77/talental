"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AVAILABLE_MODELS } from "@/lib/models";
import { createPromptAction } from "../actions";

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function NewPromptButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [model, setModel] = useState(AVAILABLE_MODELS[0]?.value ?? "");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setLabel("");
    setKey("");
    setKeyTouched(false);
    setModel(AVAILABLE_MODELS[0]?.value ?? "");
    setBody("");
    setError(null);
  }

  function onLabelChange(v: string) {
    setLabel(v);
    if (!keyTouched) setKey(slugify(v));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createPromptAction({
        key,
        label,
        body,
        model,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.actionOk("Prompt creado");
      reset();
      setOpen(false);
      router.push(`/settings/prompts/${key}`);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1">
        <Plus className="h-3.5 w-3.5" />
        Nuevo prompt
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!pending) {
            setOpen(o);
            if (!o) reset();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo prompt</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <Field label="Label" required>
              <Input
                value={label}
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="Ej: Candidate Report"
                required
                autoFocus
              />
            </Field>
            <Field
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
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Modelo" required>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Body" required>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                required
                placeholder="Pega el cuerpo del prompt aquí. Puedes usar variables tipo {{nombre}} si tu integración las procesa."
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
              />
            </Field>
            {error ? (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-md border border-danger-soft bg-danger-soft/40 px-3 py-2 text-xs text-danger"
              >
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending} className="gap-2">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending ? "Creando…" : "Crear prompt"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
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
