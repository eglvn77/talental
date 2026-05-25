"use client";

import { Briefcase, Building2, Clock, MapPin } from "lucide-react";
import type { CareersJobDetail } from "../_lib/data";

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
export function JobPostingBody({ job }: { job: CareersJobDetail }) {
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
    // Apply form is the next phase — wire to the modal then.
    alert("El formulario de aplicación llega pronto.");
  }

  return (
    <>
      {/* Sticky compact header. `top-0` because the careers branded
          header sits in normal flow above it; if we ever make that
          sticky too, this will need `top-[<height>]`. */}
      <div className="sticky top-0 z-20 border-b border-border bg-bg-1/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-foreground">
              {job.title}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {generalChips.map((c, i) => {
                const Icon = c.icon;
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Icon className="h-3 w-3" />
                    {c.label}
                  </span>
                );
              })}
              {salaryText ? (
                <span className="text-foreground">{salaryText}</span>
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

      {/* Two-column body on desktop, JD-first on mobile. */}
      <main className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[1fr_280px]">
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

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <button
            type="button"
            onClick={handleApply}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-fg-on-accent transition-colors hover:bg-accent/90"
          >
            Aplicar a este rol
          </button>
          <div className="rounded-md border border-border bg-bg-1 p-4 text-xs text-muted-foreground">
            <dl className="space-y-2">
              {job.show_company_in_posting && job.company_name ? (
                <Row label="Empresa" value={job.company_name} />
              ) : null}
              {job.work_modality ? (
                <Row
                  label="Modalidad"
                  value={
                    MODALITY_LABELS[job.work_modality] ?? job.work_modality
                  }
                />
              ) : null}
              {job.location ? (
                <Row label="Ubicación" value={job.location} />
              ) : null}
              {job.contract_type ? (
                <Row
                  label="Contrato"
                  value={
                    CONTRACT_LABELS[job.contract_type] ?? job.contract_type
                  }
                />
              ) : null}
              {job.working_hours ? (
                <Row
                  label="Jornada"
                  value={
                    HOURS_LABELS[job.working_hours] ?? job.working_hours
                  }
                />
              ) : null}
              {salaryText ? (
                <Row label="Salario" value={salaryText} />
              ) : null}
            </dl>
          </div>
        </aside>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  );
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
