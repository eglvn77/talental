"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type JobRow } from "@/lib/hiring";
import { updateJobAction } from "../../../actions";
import { NumberInputWithCommas } from "../../new/number-input";
import { LocationAutocomplete } from "../../new/location-autocomplete";
import { RichTextEditor } from "../../../_components/rich-text-editor";

export function JobSettingsForm({
  role,
  mapsApiKey,
}: {
  role: JobRow;
  mapsApiKey: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateJobAction({
        jobId: role.id,
        title: String(fd.get("title") ?? ""),
        location: String(fd.get("location") ?? "") || null,
        workModality: (fd.get("work_modality") as string) || null,
        salaryMin: fd.get("salary_min")
          ? Number(fd.get("salary_min"))
          : null,
        salaryMax: fd.get("salary_max")
          ? Number(fd.get("salary_max"))
          : null,
        salaryCurrency: String(fd.get("salary_currency") ?? "MXN"),
        publicDescription: String(fd.get("public_description") ?? "") || null,
        aiScoringEnabled: fd.get("ai_scoring_enabled") === "on",
        aiScoringCriteria:
          String(fd.get("ai_scoring_criteria") ?? "") || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Título" required>
        <Input name="title" defaultValue={role.title} required />
      </Field>

      <Field label="Ubicación">
        <LocationAutocomplete
          apiKey={mapsApiKey}
          defaultValue={role.location ?? ""}
        />
      </Field>

      <Field label="Tipo de trabajo">
        <select
          name="work_modality"
          defaultValue={role.work_modality ?? ""}
          className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Sin especificar</option>
          <option value="remote">Remoto</option>
          <option value="hybrid">Híbrido</option>
          <option value="onsite">Presencial</option>
        </select>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Salario mín.">
          <NumberInputWithCommas
            name="salary_min"
            defaultValue={role.salary_min}
          />
        </Field>
        <Field label="Salario máx.">
          <NumberInputWithCommas
            name="salary_max"
            defaultValue={role.salary_max}
          />
        </Field>
        <Field label="Moneda">
          <Input
            name="salary_currency"
            defaultValue={role.salary_currency ?? "MXN"}
          />
        </Field>
      </div>

      <Field label="Descripción de puesto">
        <RichTextEditor
          name="public_description"
          defaultValue={role.public_description ?? ""}
        />
      </Field>

      <div className="rounded-md border border-border bg-muted/20 p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="ai_scoring_enabled"
            defaultChecked={role.ai_scoring_enabled}
            className="h-4 w-4"
          />
          Calificación con IA
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Si lo activas, los screenings y entrevistas completos se califican
          contra los criterios de abajo.
        </p>
        <textarea
          name="ai_scoring_criteria"
          rows={3}
          defaultValue={role.ai_scoring_criteria ?? ""}
          placeholder="Ejemplo: priorizar experiencia en producto/datos, contexto B2B SaaS, manejo de stakeholders, inglés fluido."
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {saved ? <p className="text-xs text-green-700">Guardado.</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
