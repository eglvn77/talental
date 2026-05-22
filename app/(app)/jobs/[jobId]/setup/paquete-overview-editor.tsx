"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { JobRow } from "@/lib/hiring";
import { updateJobAction } from "@/app/(app)/actions";

const ROLE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "full_headhunting", label: "Full Headhunting" },
  { value: "hybrid_ai_hunting", label: "Hybrid AI + Hunting" },
  { value: "inbound_ai_driven", label: "Inbound AI Driven" },
];

const MODALITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "remote", label: "Remoto" },
  { value: "hybrid", label: "Híbrido" },
  { value: "onsite", label: "Presencial" },
];

const COMMON_LANGUAGES = [
  "Español",
  "Inglés",
  "Portugués",
  "Francés",
  "Alemán",
  "Italiano",
  "Mandarín",
];

/** Parse a comma-joined languages string into the structured shape the UI uses. */
function parseLanguages(raw: string | null): {
  selected: string[];
  extra: string;
} {
  if (!raw) return { selected: [], extra: "" };
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const selected: string[] = [];
  const otros: string[] = [];
  for (const p of parts) {
    if (COMMON_LANGUAGES.includes(p)) selected.push(p);
    else otros.push(p);
  }
  return { selected, extra: otros.join(", ") };
}

function joinLanguages(selected: string[], extra: string): string {
  const parts = [...selected];
  const extraParts = extra
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  parts.push(...extraParts);
  return parts.join(", ");
}

export function PaqueteOverviewEditor({ job }: { job: JobRow }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const initialLangs = parseLanguages(job.language_requirements);
  const [roleType, setRoleType] = useState(job.role_type ?? "");
  const [workModality, setWorkModality] = useState(job.work_modality ?? "");
  const [location, setLocation] = useState(job.location ?? "");
  const [openDate, setOpenDate] = useState(job.open_date ?? "");
  const [targetStartDate, setTargetStartDate] = useState(
    job.target_start_date ?? "",
  );
  const [contractType, setContractType] = useState(job.contract_type ?? "");
  const [workingHours, setWorkingHours] = useState(job.working_hours ?? "");
  const [hiringManagerName, setHiringManagerName] = useState(
    job.hiring_manager_name ?? "",
  );
  const [compensationDetail, setCompensationDetail] = useState(
    job.compensation_detail ?? "",
  );
  const [selectedLangs, setSelectedLangs] = useState<string[]>(initialLangs.selected);
  const [extraLang, setExtraLang] = useState(initialLangs.extra);
  const [assessmentLink, setAssessmentLink] = useState(job.assessment_link ?? "");
  const [internalNotes, setInternalNotes] = useState(job.internal_notes ?? "");

  type JobPatch = Omit<Parameters<typeof updateJobAction>[0], "jobId">;
  function persist(patch: JobPatch) {
    startTransition(async () => {
      const res = await updateJobAction({ jobId: job.id, ...patch });
      if (!res.ok) {
        toast.error("No se pudo guardar", { description: res.error });
        return;
      }
      router.refresh();
    });
  }

  function toggleLang(lang: string) {
    const next = selectedLangs.includes(lang)
      ? selectedLangs.filter((l) => l !== lang)
      : [...selectedLangs, lang];
    setSelectedLangs(next);
    persist({ languageRequirements: joinLanguages(next, extraLang) });
  }

  function commitExtraLang() {
    persist({ languageRequirements: joinLanguages(selectedLangs, extraLang) });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldRow label="Tipo de rol">
        <Select
          value={roleType}
          onChange={(v) => {
            setRoleType(v);
            persist({ roleType: v });
          }}
          options={ROLE_TYPE_OPTIONS}
          placeholder="—"
        />
      </FieldRow>

      <FieldRow label="Modalidad">
        <Select
          value={workModality}
          onChange={(v) => {
            setWorkModality(v);
            persist({ workModality: v });
          }}
          options={MODALITY_OPTIONS}
          placeholder="—"
        />
      </FieldRow>

      <FieldRow label="Ubicación">
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={() => persist({ location })}
          placeholder="Ciudad, país"
        />
      </FieldRow>

      <FieldRow label="Hiring Manager">
        <Input
          value={hiringManagerName}
          onChange={(e) => setHiringManagerName(e.target.value)}
          onBlur={() => persist({ hiringManagerName })}
          placeholder="Nombre + cargo"
        />
      </FieldRow>

      <FieldRow label="Fecha de apertura">
        <input
          type="date"
          value={openDate}
          onChange={(e) => {
            setOpenDate(e.target.value);
            persist({ openDate: e.target.value });
          }}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
        />
      </FieldRow>

      <FieldRow label="Fecha de inicio target">
        <input
          type="date"
          value={targetStartDate}
          onChange={(e) => {
            setTargetStartDate(e.target.value);
            persist({ targetStartDate: e.target.value });
          }}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
        />
      </FieldRow>

      <FieldRow label="Tipo de contrato">
        <Input
          value={contractType}
          onChange={(e) => setContractType(e.target.value)}
          onBlur={() => persist({ contractType })}
          placeholder="Ej: Tiempo completo, planta"
        />
      </FieldRow>

      <FieldRow label="Horario">
        <Input
          value={workingHours}
          onChange={(e) => setWorkingHours(e.target.value)}
          onBlur={() => persist({ workingHours })}
          placeholder="Ej: 9-6 CDMX"
        />
      </FieldRow>

      <FieldRow label="Compensación" full>
        <Input
          value={compensationDetail}
          onChange={(e) => setCompensationDetail(e.target.value)}
          onBlur={() => persist({ compensationDetail })}
          placeholder="Base, variable, equity, perks…"
        />
      </FieldRow>

      <FieldRow label="Idiomas" full>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {COMMON_LANGUAGES.map((lang) => {
              const active = selectedLangs.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLang(lang)}
                  className={
                    active
                      ? "inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-foreground"
                      : "inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                  }
                >
                  {active ? <Check className="h-3 w-3" /> : null}
                  {lang}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Plus className="h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              value={extraLang}
              onChange={(e) => setExtraLang(e.target.value)}
              onBlur={commitExtraLang}
              placeholder="Otros (separados por coma)"
              className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            />
            {extraLang ? (
              <button
                type="button"
                onClick={() => {
                  setExtraLang("");
                  persist({
                    languageRequirements: joinLanguages(selectedLangs, ""),
                  });
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Quitar"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
      </FieldRow>

      <FieldRow label="Assessment link" full>
        <Input
          type="url"
          value={assessmentLink}
          onChange={(e) => setAssessmentLink(e.target.value)}
          onBlur={() => persist({ assessmentLink })}
          placeholder="https://…"
        />
      </FieldRow>

      <FieldRow label="Notas internas" full>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          onBlur={() => persist({ internalNotes })}
          rows={3}
          placeholder="Solo visible para el equipo."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </FieldRow>
    </div>
  );
}

function FieldRow({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={full ? "block md:col-span-2" : "block"}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
    >
      <option value="">{placeholder ?? ""}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
