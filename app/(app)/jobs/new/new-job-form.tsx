"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currencies";
import { createJobAction } from "../../actions";
import { CompanyCombobox } from "./company-combobox";
import { LocationAutocomplete } from "./location-autocomplete";
import { NumberInputWithCommas } from "./number-input";
import { RichTextEditor } from "../../_components/rich-text-editor";

export function NewJobForm({ mapsApiKey }: { mapsApiKey: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const companyId = String(fd.get("company_id") ?? "").trim();
    if (!companyId) {
      setError("Elige un cliente.");
      return;
    }

    // Google Maps gating: if there's text but no place_id, block.
    const locationText = String(fd.get("location") ?? "").trim();
    const placeId = String(fd.get("location_place_id") ?? "").trim();
    if (locationText && !placeId) {
      setError("Selecciona una ubicación de la lista de Google Maps");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await createJobAction({
        companyId,
        title: String(fd.get("title") ?? ""),
        publicDescription:
          (fd.get("public_description") as string) || undefined,
        workModality: (fd.get("work_modality") as string) || null,
        location: locationText || undefined,
        locationLat: fd.get("location_lat")
          ? Number(fd.get("location_lat"))
          : undefined,
        locationLng: fd.get("location_lng")
          ? Number(fd.get("location_lng"))
          : undefined,
        locationPlaceId: placeId || undefined,
        salaryMin: fd.get("salary_min")
          ? Number(fd.get("salary_min"))
          : undefined,
        salaryMax: fd.get("salary_max")
          ? Number(fd.get("salary_max"))
          : undefined,
        salaryCurrency:
          (fd.get("salary_currency") as string) || DEFAULT_CURRENCY,
        salaryType: (fd.get("salary_type") as string) || "gross",
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Vacante creada");
      router.push(`/jobs/${res.data.jobId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Título de la vacante" required>
        <Input name="title" required />
      </Field>

      <Field label="Cliente" required>
        <CompanyCombobox />
      </Field>

      <Field label="Ubicación">
        <LocationAutocomplete apiKey={mapsApiKey} />
      </Field>

      <Field label="Tipo de trabajo">
        <select
          name="work_modality"
          defaultValue=""
          className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Sin especificar</option>
          <option value="remote">Remoto</option>
          <option value="hybrid">Híbrido</option>
          <option value="onsite">Presencial</option>
        </select>
      </Field>

      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3">
        <Field label="Salario mín.">
          <NumberInputWithCommas name="salary_min" />
        </Field>
        <Field label="Salario máx.">
          <NumberInputWithCommas name="salary_max" />
        </Field>
        <Field label="Moneda">
          <select
            name="salary_currency"
            defaultValue={DEFAULT_CURRENCY}
            className="h-9 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select
            name="salary_type"
            defaultValue="gross"
            className="h-9 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="gross">Bruto</option>
            <option value="net">Neto</option>
            <option value="unspecified">Sin especificar</option>
          </select>
        </Field>
      </div>

      <Field label="Descripción de puesto">
        <RichTextEditor name="public_description" />
      </Field>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPending ? "Creando vacante…" : "Crear vacante"}
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
