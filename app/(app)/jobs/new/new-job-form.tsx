"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createJobAction } from "../../actions";
import { CompanyCombobox } from "./company-combobox";
import { LocationAutocomplete } from "./location-autocomplete";

/**
 * The list of templates a workspace exposes to the "Proceso"
 * selector. Loaded server-side and passed in by page.tsx.
 */
export type ProcessTemplateOption = {
  id: string;
  name: string;
  is_default: boolean;
};

/**
 * Open-vacante flow — slim version.
 *
 * Captures the bare minimum to start a pipeline: title, company,
 * ubicación, and which process template's stages get seeded. Fee
 * terms moved to a dedicated admin-only tab inside the vacante
 * (`/jobs/[jobId]/terms`); they're no longer collected here.
 *
 * The vacante still nace en Borrador — JD, requisitos, sourcing
 * questions, etc. land via Kickoff after opening.
 */
export function NewJobForm({
  templates,
}: {
  templates: ProcessTemplateOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultTemplate =
    templates.find((t) => t.is_default) ?? templates[0] ?? null;
  const [templateId, setTemplateId] = useState<string | null>(
    defaultTemplate?.id ?? null,
  );

  const [companyId, setCompanyId] = useState<string>("");

  // Location state mirrors the autocomplete payload — we only let
  // through values that carried a Google place_id (the action rejects
  // free-text locations).
  const [location, setLocation] = useState<{
    location: string;
    placeId: string;
    lat: string;
    lng: string;
  } | null>(null);

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();

    if (!title) {
      setError("Captura el título de la vacante.");
      return;
    }
    if (!companyId) {
      setError("Elige una empresa.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await createJobAction({
        companyId,
        title,
        location: location?.location || undefined,
        locationLat: location?.lat ? Number(location.lat) : undefined,
        locationLng: location?.lng ? Number(location.lng) : undefined,
        locationPlaceId: location?.placeId || undefined,
        processTemplateId: templateId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.actionOk("Vacante creada en Borrador");
      router.push(`/jobs/${res.data.jobId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Título del puesto" required>
        <Input
          name="title"
          required
          autoFocus
          placeholder="Ej: Senior Product Designer"
        />
      </Field>

      <Field label="Empresa" required>
        <CompanyCombobox
          defaultCompany={null}
          onChange={(c) => setCompanyId(c?.id ?? "")}
        />
      </Field>

      <Field label="Ubicación">
        <LocationAutocomplete
          apiKey={mapsApiKey}
          onChange={(loc) => setLocation(loc)}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Selecciona una ciudad / región del autocompletado de Google.
        </p>
      </Field>

      <Field label="Proceso" required>
        {templates.length === 0 ? (
          <div className="rounded-md border border-border bg-bg-3 px-3 py-2 text-xs text-muted-foreground">
            Tu workspace no tiene plantillas configuradas. Se usará el
            pipeline default de 10 etapas.
          </div>
        ) : (
          <select
            value={templateId ?? ""}
            onChange={(e) => setTemplateId(e.target.value || null)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Las etapas de esta plantilla se copian al pipeline de la
          vacante. Puedes administrar plantillas en Configuración →
          Procesos.
        </p>
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

      <div className="rounded-md border border-border-soft bg-bg-3 px-3 py-2.5 text-xs text-fg-muted">
        La vacante se crea en <strong>Borrador</strong>. JD,
        requisitos, sourcing y términos comerciales se completan
        después dentro de la vacante.
      </div>

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
      <span className="text-xs font-medium text-fg-2">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
