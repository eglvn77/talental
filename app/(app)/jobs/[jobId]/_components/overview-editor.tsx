"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/toast";
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
  { value: "unspecified", label: "—" },
];

const SALARY_FREQUENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "monthly", label: "Mensual" },
  { value: "annual", label: "Anual" },
  { value: "weekly", label: "Semanal" },
  { value: "hourly", label: "Por hora" },
];

const FIELD_CLS =
  "h-8 rounded-md border border-border bg-background px-2 text-sm";

export function OverviewEditor({
  job,
  mapsApiKey,
}: {
  job: JobRow;
  mapsApiKey: string;
}) {
  const [, startTransition] = useTransition();

  const [title, setTitle] = useState(job.title);
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
      if (!res.ok) toast.saveFailed(res.error);
      // No router.refresh() — local state is the source of truth while
      // editing. The action's revalidatePath keeps server data fresh
      // for the next navigation.
    });
  }

  const contractOptions =
    contractType && !CONTRACT_TYPE_OPTIONS.includes(contractType)
      ? [contractType, ...CONTRACT_TYPE_OPTIONS]
      : CONTRACT_TYPE_OPTIONS;

  return (
    <dl className="@container/inspector space-y-1.5">
      <Row label="Título" required>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== job.title) persist({ title });
          }}
          placeholder="Senior Product Designer"
          className={`${FIELD_CLS} w-full max-w-[480px]`}
        />
      </Row>

      <Row label="Tipo de rol">
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {job.role_type
              ? (ROLE_TYPE_OPTIONS.find((o) => o.value === job.role_type)
                  ?.label ?? job.role_type)
              : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Cambia desde Calibrar
          </span>
        </div>
      </Row>

      <Row label="Modalidad">
        <select
          value={workModality}
          onChange={(e) => {
            setWorkModality(e.target.value);
            persist({ workModality: e.target.value });
          }}
          className={`${FIELD_CLS} w-[160px]`}
        >
          <option value="">—</option>
          {MODALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Ubicación">
        <div className="w-full max-w-[380px]">
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
        </div>
      </Row>

      <Row label="Tipo de contrato">
        <select
          value={contractType}
          onChange={(e) => {
            setContractType(e.target.value);
            persist({ contractType: e.target.value });
          }}
          className={`${FIELD_CLS} w-[200px]`}
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
          className={`${FIELD_CLS} w-[200px]`}
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
          className={`${FIELD_CLS} w-[160px]`}
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
          className={`${FIELD_CLS} w-[160px]`}
        />
      </Row>

      <Row label="Rango salarial">
        <div className="flex flex-wrap items-center gap-1.5">
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
            className={`${FIELD_CLS} w-24 text-right`}
          />
          <span className="text-xs text-muted-foreground">–</span>
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
            className={`${FIELD_CLS} w-24 text-right`}
          />
          <select
            value={salaryCurrency}
            onChange={(e) => {
              setSalaryCurrency(e.target.value);
              persist({ salaryCurrency: e.target.value });
            }}
            className={`${FIELD_CLS} w-[80px]`}
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
            className={`${FIELD_CLS} w-[110px]`}
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
            className={`${FIELD_CLS} w-[100px]`}
          >
            {SALARY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </Row>

      <Row label="Variables, beneficios y prestaciones">
        <input
          type="text"
          value={compensationDetail}
          onChange={(e) => setCompensationDetail(e.target.value)}
          onBlur={() => persist({ compensationDetail })}
          placeholder="Ej: bono anual 20%, equity, vales, SGMM"
          className={`${FIELD_CLS} w-full max-w-[560px]`}
        />
      </Row>

      <Row label="Link de caso práctico">
        <input
          type="url"
          value={assessmentLink}
          onChange={(e) => setAssessmentLink(e.target.value)}
          onBlur={() => persist({ assessmentLink })}
          placeholder="https://…"
          className={`${FIELD_CLS} w-full max-w-[480px]`}
        />
      </Row>

      <StackedRow label="Notas internas">
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          onBlur={() => persist({ internalNotes })}
          rows={3}
          placeholder="Solo visible para el equipo."
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      </StackedRow>
    </dl>
  );
}

/**
 * Inspector-style row: label on the left at a fixed width, value on
 * the right sized to its content. Mirrors Linear / Notion property
 * panels — short values stay narrow, long values can flex.
 *
 * Responsive via container queries (not viewport): when the inspector
 * itself is narrower than 480px (e.g. inside a slide-over or on
 * mobile), labels stack above the value so the field gets full width.
 */
function Row({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-1 py-0.5 @[480px]/inspector:grid-cols-[180px_1fr] @[480px]/inspector:items-center @[480px]/inspector:gap-3">
      <dt className="text-xs text-muted-foreground">
        {label}
        {required ? <span className="text-amber-600"> *</span> : null}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/**
 * For textarea / multi-line fields the inline layout looks cramped.
 * Stack label on top of value but keep the same label sizing.
 */
function StackedRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-2">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
