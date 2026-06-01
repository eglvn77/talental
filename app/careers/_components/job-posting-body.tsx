"use client";

import { useState } from "react";
import { Banknote, Briefcase, Building2, Clock, FileText, MapPin } from "lucide-react";
import { ApplyModal } from "./apply-modal";
import { ShareButtons } from "./share-buttons";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import type {
  CareersJobCustomField,
  CareersJobDetail,
} from "../_lib/data";

const MODALITY_KEYS = ["remote", "hybrid", "onsite"];
const CONTRACT_KEYS = ["permanent", "temporary", "contractor", "internship"];
const HOURS_KEYS = ["full_time", "part_time", "flexible"];

const FREQ_KEYS: Record<string, string> = {
  monthly: "freqLongMonthly",
  annual: "freqLongAnnual",
  weekly: "freqLongWeekly",
  hourly: "freqLongHourly",
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
  const t = useT();
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
  const salaryText =
    job.show_salary_in_posting && (job.salary_min || job.salary_max)
      ? formatSalary(
          t,
          job.salary_min,
          job.salary_max,
          job.salary_currency,
          job.salary_frequency,
        )
      : null;

  // Order: location, company, then modality / contract / hours / salary.
  // Rendered in two columns (≈3 left, 3 right) so the row never reads as
  // one saturated line.
  const generalChips = [
    job.location ? { icon: MapPin, label: job.location } : null,
    job.show_company_in_posting && job.company_name
      ? { icon: Building2, label: job.company_name }
      : null,
    job.work_modality
      ? {
          icon: Briefcase,
          label: MODALITY_KEYS.includes(job.work_modality)
            ? t(`careers.modality.${job.work_modality}`)
            : job.work_modality,
        }
      : null,
    job.contract_type
      ? {
          icon: FileText,
          label: CONTRACT_KEYS.includes(job.contract_type)
            ? t(`careers.contract.${job.contract_type}`)
            : job.contract_type,
        }
      : null,
    job.working_hours
      ? {
          icon: Clock,
          label: HOURS_KEYS.includes(job.working_hours)
            ? t(`careers.hours.${job.working_hours}`)
            : job.working_hours,
        }
      : null,
    salaryText ? { icon: Banknote, label: salaryText } : null,
  ].filter(Boolean) as Array<{
    icon: typeof Building2;
    label: string;
  }>;

  const half = Math.ceil(generalChips.length / 2);
  const chipColumns = [generalChips.slice(0, half), generalChips.slice(half)];

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
            <div className="mt-2 flex flex-wrap gap-x-10 gap-y-1.5 text-sm text-foreground/80">
              {chipColumns.map((col, ci) =>
                col.length > 0 ? (
                  <div key={ci} className="flex flex-col gap-1.5">
                    {col.map((c, i) => {
                      const Icon = c.icon;
                      return (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5"
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {c.label}
                        </span>
                      );
                    })}
                  </div>
                ) : null,
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleApply}
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-fg-on-accent transition-colors hover:bg-accent/90"
          >
            {t("careers.apply")}
          </button>
        </div>
      </div>

      {/* Body. Two-column layout: JD on the left, sidebar on the
          right with Share buttons (always) + optional custom-field
          card. Share is always useful — that's the affordance for
          the recruiter to send the link out via WhatsApp/LinkedIn,
          which is the primary distribution path for these postings.
          The sticky bar above covers the always-visible apply CTA. */}
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-start lg:justify-between">
        <article className="min-w-0 flex-1 lg:max-w-3xl">
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
            <div className="rounded-md border border-dashed border-border bg-bg-1 px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {t("careers.descriptionComingSoonTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("careers.descriptionComingSoonBody")}
              </p>
            </div>
          )}
        </article>

        <aside className="flex shrink-0 flex-col items-end gap-5 lg:sticky lg:top-24 lg:self-start">
          <ShareButtons jobTitle={job.title} orientation="vertical" />
          {visibleCustomFields.length > 0 ? (
            <div className="w-full rounded-md border border-border bg-bg-1 p-4 text-xs text-muted-foreground lg:w-[240px]">
              <dl className="space-y-2">
                {visibleCustomFields.map((f) => (
                  <Row
                    key={f.definition_id}
                    label={f.label}
                    value={renderCustomFieldValue(t, f)}
                  />
                ))}
              </dl>
            </div>
          ) : null}
        </aside>
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
function renderCustomFieldValue(
  t: TFunction,
  f: CareersJobCustomField,
): React.ReactNode {
  const v = f.value;
  const dash = t("careers.emptyValue");
  switch (f.kind) {
    case "url": {
      const href = typeof v === "string" ? v : "";
      if (!href) return dash;
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-accent hover:underline"
        >
          {t("careers.open")} ↗
        </a>
      );
    }
    case "boolean":
      return v === true
        ? t("careers.yes")
        : v === false
          ? t("careers.no")
          : dash;
    case "multi_select":
      return Array.isArray(v) ? v.join(", ") : dash;
    case "number":
      return typeof v === "number"
        ? v.toLocaleString("es-MX")
        : String(v ?? dash);
    default:
      return String(v ?? dash);
  }
}

function formatSalary(
  t: TFunction,
  min: number | null,
  max: number | null,
  currency: string | null,
  frequency: string,
): string {
  const cur = currency ?? "MXN";
  // Prefix the figures with a "$" currency sign (MXN and USD both use
  // it). The ISO code still trails so $ + MXN/USD stays unambiguous.
  const f = (n: number) =>
    `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
  const range =
    min && max
      ? `${f(min)} – ${f(max)}`
      : min
        ? t("careers.salaryFrom", { amount: f(min) })
        : max
          ? t("careers.salaryUpTo", { amount: f(max) })
          : null;
  if (!range) return "";
  const freq = FREQ_KEYS[frequency] ? t(`careers.${FREQ_KEYS[frequency]}`) : "";
  return `${range} ${cur} ${freq}`.trim();
}
