"use client";

import { useState } from "react";
import { Briefcase, Building2, Clock, MapPin } from "lucide-react";
import { ApplyModal } from "./apply-modal";
import type {
  CareersJobCustomField,
  CareersJobDetail,
} from "../_lib/data";

const MODALITY_LABELS: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
};

const CONTRACT_LABELS: Record<string, string> = {
  permanent: "Permanente",
  temporary: "Temporal",
  contractor: "Honorarios",
  internship: "Becario",
};

const HOURS_LABELS: Record<string, string> = {
  full_time: "Tiempo completo",
  part_time: "Medio tiempo",
  flexible: "Flexible",
};

const FREQ_LABELS: Record<string, string> = {
  monthly: "mensual",
  annual: "anual",
  weekly: "semanal",
  hourly: "por hora",
};

/**
 * Body of the public job posting page. Three layers:
 *
 *   1) Compact sticky header — title + chips (company / modalidad /
 *      ubicación / tipo de contrato / jornada / salario), with a
 *      persistent "Aplicar" CTA on the right. Sticky below the
 *      branded chrome so the recruiter sees the role + the apply
 *      affordance no matter how deep they scroll.
 *
 *   2) Wide JD column — `public_description` rendered as sanitized
 *      rich text. This is the meat of the page; everything else is
 *      framing. Capped at `max-w-3xl` so line length stays readable
 *      on big monitors.
 *
 *   3) Sidebar (on desktop) repeats the apply button + summary chips.
 *      The sticky header covers the mobile case; the sidebar makes
 *      the desktop reading flow feel like a real posting page rather
 *      than a memo.
 *
 * Apply flow is a follow-up — the buttons here open an empty
 * `<dialog>` for now with a "Próximamente" message. The migration
 * already added `screening_questions` etc. so we can wire the form
 * next pass.
 */
export function JobPostingBody({
  job,
  customFields,
}: {
  job: CareersJobDetail;
  customFields: CareersJobCustomField[];
}) {
  const [applyOpen, setApplyOpen] = useState(false);

  // Drop custom fields whose value is empty/null — the careers page
  // should only surface fields the admin actually populated. This
  // also avoids rendering "—" rows for system fields like
  // assessment_link when the role doesn't have an assessment yet.
  const visibleCustomFields = customFields.filter((f) => {
    const v = f.value;
    if (v === null || v === undefined) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
  const generalChips = [
    job.show_company_in_posting && job.company_name
      ? { icon: Building2, label: job.company_name }
      : null,
    job.work_modality
      ? {
          icon: Briefcase,
          label: MODALITY_LABELS[job.work_modality] ?? job.work_modality,
        }
      : null,
    job.location ? { icon: MapPin, label: job.location } : null,
    job.contract_type
      ? {
          icon: Briefcase,
          label: CONTRACT_LABELS[job.contract_type] ?? job.contract_type,
        }
      : null,
    job.working_hours
      ? {
          icon: Clock,
          label: HOURS_LABELS[job.working_hours] ?? job.working_hours,
        }
      : null,
  ].filter(Boolean) as Array<{
    icon: typeof Building2;
    label: string;
  }>;

  const salaryText =
    job.show_salary_in_posting && (job.salary_min || job.salary_max)
      ? formatSalary(
          job.salary_min,
          job.salary_max,
          job.salary_currency,
          job.salary_frequency,
        )
      : null;

  function handleApply() {
    setApplyOpen(true);
  }

  return (
    <>
      {/* Sticky compact header. `top-0` because the careers branded
          header sits in normal flow above it; if we ever make that
          sticky too, this will need `top-[<height>]`. The meta chips
          live here exclusively now — the sidebar used to repeat
          them, which looked redundant on desktop. */}
      <div className="sticky top-0 z-20 border-b border-border bg-bg-1/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-foreground sm:text-2xl">
              {job.title}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-foreground/80">
              {generalChips.map((c, i) => {
                const Icon = c.icon;
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {c.label}
                  </span>
                );
              })}
              {salaryText ? (
                <span className="font-medium text-foreground">
                  {salaryText}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={handleApply}
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-fg-on-accent transition-colors hover:bg-accent/90"
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* Body. Two-column layout only when the workspace has
          custom-field values worth surfacing — otherwise the JD gets
          the full width and reads better on big monitors. The
          sticky bar above covers the always-visible apply CTA, so
          the sidebar doesn't need to duplicate it either. */}
      <main
        className={
          "mx-auto w-full px-6 py-10 " +
          (visibleCustomFields.length > 0
            ? "grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-[1fr_280px]"
            : "max-w-3xl")
        }
      >
        <article className="min-w-0">
          {job.public_description ? (
            <div
              className="prose prose-sm max-w-none sm:prose-base"
              // The HTML was already sanitized at write time in
              // updateJobAction; we trust it here. The careers anon
              // role can't write to `jobs.public_description`, so
              // every value we render came through that sanitizer.
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: job.public_description }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Aún no hay descripción para esta vacante.
            </p>
          )}
        </article>

        {visibleCustomFields.length > 0 ? (
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-md border border-border bg-bg-1 p-4 text-xs text-muted-foreground">
              <dl className="space-y-2">
                {visibleCustomFields.map((f) => (
                  <Row
                    key={f.definition_id}
                    label={f.label}
                    value={renderCustomFieldValue(f)}
                  />
                ))}
              </dl>
            </div>
          </aside>
        ) : null}
      </main>

      <ApplyModal
        open={applyOpen}
        onOpenChange={setApplyOpen}
        job={job}
      />
    </>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 truncate text-right text-foreground">
        {value}
      </dd>
    </div>
  );
}

/**
 * Render a custom-field value for the careers sidebar. URLs become
 * an "Abrir ↗" link (same pattern as the jobs table column),
 * booleans flip to Sí/No, multi-selects join with commas, dates fall
 * through as-is. Anything unrecognized stringifies.
 */
function renderCustomFieldValue(f: CareersJobCustomField): React.ReactNode {
  const v = f.value;
  switch (f.kind) {
    case "url": {
      const href = typeof v === "string" ? v : "";
      if (!href) return "—";
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-accent hover:underline"
        >
          Abrir ↗
        </a>
      );
    }
    case "boolean":
      return v === true ? "Sí" : v === false ? "No" : "—";
    case "multi_select":
      return Array.isArray(v) ? v.join(", ") : "—";
    case "number":
      return typeof v === "number"
        ? v.toLocaleString("es-MX")
        : String(v ?? "—");
    default:
      return String(v ?? "—");
  }
}

function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
  frequency: string,
): string {
  const cur = currency ?? "MXN";
  const f = (n: number) =>
    n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
  const range =
    min && max
      ? `${f(min)} – ${f(max)}`
      : min
        ? `Desde ${f(min)}`
        : max
          ? `Hasta ${f(max)}`
          : null;
  if (!range) return "";
  return `${range} ${cur} ${FREQ_LABELS[frequency] ?? ""}`.trim();
}
