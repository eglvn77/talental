"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { JobRow } from "@/lib/hiring";
import { CURRENCIES } from "@/lib/currencies";
import { updateJobAction } from "@/app/(app)/actions";
import { LocationAutocomplete } from "@/app/(app)/jobs/new/location-autocomplete";

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

const INPUT_CLS =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-sm";

export function PaqueteOverviewEditor({
  job,
  mapsApiKey,
}: {
  job: JobRow;
  mapsApiKey: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [title, setTitle] = useState(job.title);
  const [roleType, setRoleType] = useState(job.role_type ?? "");
  const [workModality, setWorkModality] = useState(job.work_modality ?? "");
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

  const contractOptions =
    contractType && !CONTRACT_TYPE_OPTIONS.includes(contractType)
      ? [contractType, ...CONTRACT_TYPE_OPTIONS]
      : CONTRACT_TYPE_OPTIONS;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Row label="Título" required full>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== job.title) persist({ title });
          }}
          placeholder="Senior Product Designer"
          className={INPUT_CLS}
        />
      </Row>

      <Row label="Tipo de rol">
        <select
          value={roleType}
          onChange={(e) => {
            setRoleType(e.target.value);
            persist({ roleType: e.target.value });
          }}
          className={INPUT_CLS}
        >
          <option value="">—</option>
          {ROLE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Modalidad">
        <select
          value={workModality}
          onChange={(e) => {
            setWorkModality(e.target.value);
            persist({ workModality: e.target.value });
          }}
          className={INPUT_CLS}
        >
          <option value="">—</option>
          {MODALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Ubicación" full>
        <LocationAutocomplete
          apiKey={mapsApiKey}
          defaultValue={job.location ?? ""}
          defaultPlaceId={job.location_place_id ?? ""}
          onChange={(loc) =>
            persist({
              location: loc.location || null,
              locationPlaceId: loc.placeId || null,
              locationLat: loc.lat ? Number(loc.lat) : null,
              locationLng: loc.lng ? Number(loc.lng) : null,
            })
          }
        />
      </Row>

      <Row label="Tipo de contrato">
        <select
          value={contractType}
          onChange={(e) => {
            setContractType(e.target.value);
            persist({ contractType: e.target.value });
          }}
          className={INPUT_CLS}
        >
          <option value="">—</option>
          {contractOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Horario">
        <input
          type="text"
          value={workingHours}
          onChange={(e) => setWorkingHours(e.target.value)}
          onBlur={() => persist({ workingHours })}
          placeholder="Ej: 9:00 a 18:00"
          className={INPUT_CLS}
        />
      </Row>

      <Row label="Fecha de apertura">
        <input
          type="date"
          value={openDate}
          onChange={(e) => {
            setOpenDate(e.target.value);
            persist({ openDate: e.target.value });
          }}
          className={INPUT_CLS}
        />
      </Row>

      <Row label="Fecha de contratación deseada">
        <input
          type="date"
          value={targetStartDate}
          onChange={(e) => {
            setTargetStartDate(e.target.value);
            persist({ targetStartDate: e.target.value });
          }}
          className={INPUT_CLS}
        />
      </Row>

      <Row label="Rango salarial" full>
        <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={salaryMin}
            onChange={(e) =>
              setSalaryMin(e.target.value.replace(/[^\d]/g, ""))
            }
            onBlur={() =>
              persist({ salaryMin: salaryMin === "" ? null : Number(salaryMin) })
            }
            placeholder="Mín."
            className={INPUT_CLS}
          />
          <input
            type="text"
            inputMode="numeric"
            value={salaryMax}
            onChange={(e) =>
              setSalaryMax(e.target.value.replace(/[^\d]/g, ""))
            }
            onBlur={() =>
              persist({ salaryMax: salaryMax === "" ? null : Number(salaryMax) })
            }
            placeholder="Máx."
            className={INPUT_CLS}
          />
          <select
            value={salaryCurrency}
            onChange={(e) => {
              setSalaryCurrency(e.target.value);
              persist({ salaryCurrency: e.target.value });
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
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
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
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
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {SALARY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </Row>

      <Row label="Variables, beneficios y prestaciones" full>
        <input
          type="text"
          value={compensationDetail}
          onChange={(e) => setCompensationDetail(e.target.value)}
          onBlur={() => persist({ compensationDetail })}
          placeholder="Ej: bono anual 20%, equity, vales de despensa, SGMM"
          className={INPUT_CLS}
        />
      </Row>

      <Row label="Link de caso práctico" full>
        <input
          type="url"
          value={assessmentLink}
          onChange={(e) => setAssessmentLink(e.target.value)}
          onBlur={() => persist({ assessmentLink })}
          placeholder="https://…"
          className={INPUT_CLS}
        />
      </Row>

      <Row label="Notas internas" full>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          onBlur={() => persist({ internalNotes })}
          rows={3}
          placeholder="Solo visible para el equipo."
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      </Row>
    </div>
  );
}

function Row({
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
      <span className="mb-0.5 block text-[11px] font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
