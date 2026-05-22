"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { JobRow } from "@/lib/hiring";
import { CURRENCIES } from "@/lib/currencies";
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

const CONTRACT_TYPE_OPTIONS = [
  "Tiempo Completo",
  "Medio Tiempo",
  "Por Honorarios",
  "Por Proyecto",
  "Temporal",
  "Becario / Pasante",
  "Freelance",
];

const SALARY_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "gross", label: "Bruto" },
  { value: "net", label: "Neto" },
  { value: "unspecified", label: "Sin especificar" },
];

const SALARY_FREQUENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "monthly", label: "Mensual" },
  { value: "annual", label: "Anual" },
  { value: "weekly", label: "Semanal" },
  { value: "hourly", label: "Por hora" },
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
  const [title, setTitle] = useState(job.title);
  const [roleType, setRoleType] = useState(job.role_type ?? "");
  const [workModality, setWorkModality] = useState(job.work_modality ?? "");
  const [location, setLocation] = useState(job.location ?? "");
  const [openDate, setOpenDate] = useState(job.open_date ?? "");
  const [targetStartDate, setTargetStartDate] = useState(
    job.target_start_date ?? "",
  );
  const [contractType, setContractType] = useState(job.contract_type ?? "");
  const [workingHours, setWorkingHours] = useState(job.working_hours ?? "");
  const [compensationDetail, setCompensationDetail] = useState(
    job.compensation_detail ?? "",
  );
  const [salaryMin, setSalaryMin] = useState<string>(
    job.salary_min != null ? String(job.salary_min) : "",
  );
  const [salaryMax, setSalaryMax] = useState<string>(
    job.salary_max != null ? String(job.salary_max) : "",
  );
  const [salaryCurrency, setSalaryCurrency] = useState(
    job.salary_currency ?? "MXN",
  );
  const [salaryFrequency, setSalaryFrequency] = useState<string>(
    job.salary_frequency ?? "monthly",
  );
  const [salaryType, setSalaryType] = useState<string>(
    job.salary_type ?? "gross",
  );
  const [selectedLangs, setSelectedLangs] = useState<string[]>(
    initialLangs.selected,
  );
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

  function commitSalary(field: "min" | "max" | "currency" | "frequency" | "type") {
    const parsedMin = salaryMin === "" ? null : Number(salaryMin);
    const parsedMax = salaryMax === "" ? null : Number(salaryMax);
    persist({
      salaryMin: field === "min" ? parsedMin : undefined,
      salaryMax: field === "max" ? parsedMax : undefined,
      salaryCurrency: field === "currency" ? salaryCurrency : undefined,
      salaryFrequency: field === "frequency" ? salaryFrequency : undefined,
      salaryType: field === "type" ? salaryType : undefined,
    });
  }

  // The dropdown for contract_type. If the current value isn't in the
  // standard list (kickoff may have generated something custom), prepend
  // it as the selected option so it's preserved until the user changes it.
  const contractOptions = contractType && !CONTRACT_TYPE_OPTIONS.includes(contractType)
    ? [contractType, ...CONTRACT_TYPE_OPTIONS]
    : CONTRACT_TYPE_OPTIONS;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldRow label="Título" required full>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== job.title) persist({ title });
          }}
          placeholder="Senior Product Designer"
        />
      </FieldRow>

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

      <FieldRow label="Tipo de contrato">
        <Select
          value={contractType}
          onChange={(v) => {
            setContractType(v);
            persist({ contractType: v });
          }}
          options={contractOptions.map((o) => ({ value: o, label: o }))}
          placeholder="—"
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

      <FieldRow label="Fecha de contratación deseada">
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

      <FieldRow label="Horario">
        <Input
          value={workingHours}
          onChange={(e) => setWorkingHours(e.target.value)}
          onBlur={() => persist({ workingHours })}
          placeholder="Ej: 9:00 a 18:00"
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

      <FieldRow label="Rango salarial" full>
        <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2">
          <Input
            type="text"
            inputMode="numeric"
            value={salaryMin}
            onChange={(e) =>
              setSalaryMin(e.target.value.replace(/[^\d]/g, ""))
            }
            onBlur={() => commitSalary("min")}
            placeholder="Mín."
          />
          <Input
            type="text"
            inputMode="numeric"
            value={salaryMax}
            onChange={(e) =>
              setSalaryMax(e.target.value.replace(/[^\d]/g, ""))
            }
            onBlur={() => commitSalary("max")}
            placeholder="Máx."
          />
          <select
            value={salaryCurrency}
            onChange={(e) => {
              setSalaryCurrency(e.target.value);
              persist({ salaryCurrency: e.target.value });
            }}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <select
            value={salaryFrequency}
            onChange={(e) => {
              setSalaryFrequency(e.target.value);
              persist({ salaryFrequency: e.target.value });
            }}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {SALARY_FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={salaryType}
            onChange={(e) => {
              setSalaryType(e.target.value);
              persist({ salaryType: e.target.value });
            }}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {SALARY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
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
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={full ? "block md:col-span-2" : "block"}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
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
