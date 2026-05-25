"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type JobRow } from "@/lib/hiring";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currencies";
import { updateJobAction } from "../../../actions";
import { NumberInputWithCommas } from "../../new/number-input";
import { LocationAutocomplete } from "../../new/location-autocomplete";

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

    const locationText = String(fd.get("location") ?? "").trim();
    const placeId = String(fd.get("location_place_id") ?? "").trim();
    if (locationText && !placeId) {
      setError("Selecciona una ubicación de la lista de Google Maps");
      setSaved(false);
      return;
    }

    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateJobAction({
        jobId: role.id,
        title: String(fd.get("title") ?? ""),
        location: locationText || null,
        locationPlaceId: placeId || null,
        locationLat: fd.get("location_lat")
          ? Number(fd.get("location_lat"))
          : undefined,
        locationLng: fd.get("location_lng")
          ? Number(fd.get("location_lng"))
          : undefined,
        workModality: (fd.get("work_modality") as string) || null,
        salaryMin: fd.get("salary_min")
          ? Number(fd.get("salary_min"))
          : null,
        salaryMax: fd.get("salary_max")
          ? Number(fd.get("salary_max"))
          : null,
        salaryCurrency: String(fd.get("salary_currency") ?? DEFAULT_CURRENCY),
        salaryType: String(fd.get("salary_type") ?? "gross"),
        salaryFrequency: String(fd.get("salary_frequency") ?? "monthly"),
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
          defaultPlaceId={role.location_place_id ?? ""}
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

      <div className="grid grid-cols-5 gap-3">
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
          <select
            name="salary_currency"
            defaultValue={role.salary_currency ?? DEFAULT_CURRENCY}
            className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Frecuencia">
          <select
            name="salary_frequency"
            defaultValue={role.salary_frequency ?? "monthly"}
            className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="monthly">Mensual</option>
            <option value="annual">Anual</option>
            <option value="weekly">Semanal</option>
            <option value="hourly">Por hora</option>
          </select>
        </Field>
        <Field label="Tipo">
          <select
            name="salary_type"
            defaultValue={role.salary_type ?? "gross"}
            className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="gross">Bruto</option>
            <option value="net">Neto</option>
            <option value="unspecified">Sin especificar</option>
          </select>
        </Field>
      </div>

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

      {error ? <p className="text-xs text-danger">{error}</p> : null}
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
