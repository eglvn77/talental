"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import type { CareersJobListItem } from "../_lib/data";

const MODALITY_KEYS = ["remote", "hybrid", "onsite"] as const;
const CONTRACT_KEYS = [
  "permanent",
  "temporary",
  "contractor",
  "internship",
] as const;
const HOURS_KEYS = ["full_time", "part_time", "flexible"] as const;

const FREQ_KEYS: Record<string, string> = {
  monthly: "freqMonthly",
  annual: "freqAnnual",
  weekly: "freqWeekly",
  hourly: "freqHourly",
};

function modalityLabel(t: TFunction, v: string): string {
  return (MODALITY_KEYS as readonly string[]).includes(v)
    ? t(`careers.modality.${v}`)
    : v;
}
function contractLabel(t: TFunction, v: string): string {
  return (CONTRACT_KEYS as readonly string[]).includes(v)
    ? t(`careers.contract.${v}`)
    : v;
}
function hoursLabel(t: TFunction, v: string): string {
  return (HOURS_KEYS as readonly string[]).includes(v)
    ? t(`careers.hours.${v}`)
    : v;
}

/**
 * Public-facing list of published vacantes. Toolbar matches the
 * authenticated ATS — a 32×32 Search button that expands inline on
 * click + a 32×32 Filtros button that pops a multi-select panel with
 * facets pulled from the actual data.
 *
 * Filtering is client-side because each agency has at most a few
 * hundred public vacantes; we already loaded all of them server-side
 * for the list itself. No URL state for now — refresh resets the
 * filters; if a recruiter wants to share a pre-filtered link we can
 * promote them to `?modality=remote&…` later.
 */
export function JobsList({
  jobs,
  wsSlug,
}: {
  jobs: CareersJobListItem[];
  /** Workspace slug, used to construct the per-job link. */
  wsSlug: string;
}) {
  const t = useT();
  // Preserve the ?src tracking token so it survives into the job page +
  // apply flow (source auto-attribution).
  const sp = useSearchParams();
  const src = sp?.get("src") || null;
  const suffix = src ? `?src=${encodeURIComponent(src)}` : "";
  const [q, setQ] = useState("");
  const [modality, setModality] = useState<Set<string>>(new Set());
  const [contract, setContract] = useState<Set<string>>(new Set());
  const [hours, setHours] = useState<Set<string>>(new Set());
  const [locations, setLocations] = useState<Set<string>>(new Set());

  // Build the location facet from the loaded jobs. Free-text input
  // would force candidates to guess the recruiter's spelling; a
  // dropdown of "what's actually open" is friendlier. De-dupes
  // case-insensitively but preserves the canonical casing of the
  // first occurrence.
  const locationOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const j of jobs) {
      const v = (j.location ?? "").trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (!map.has(key)) map.set(key, v);
    }
    return Array.from(map.values())
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((v) => ({ value: v, label: v }));
  }, [jobs]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (modality.size > 0 && !modality.has(j.work_modality ?? "")) {
        return false;
      }
      if (contract.size > 0 && !contract.has(j.contract_type ?? "")) {
        return false;
      }
      if (hours.size > 0 && !hours.has(j.working_hours ?? "")) {
        return false;
      }
      if (locations.size > 0 && !locations.has(j.location ?? "")) {
        return false;
      }
      if (!ql) return true;
      return (
        j.title.toLowerCase().includes(ql) ||
        (j.location ?? "").toLowerCase().includes(ql)
      );
    });
  }, [jobs, q, modality, contract, hours, locations]);

  const activeFilterCount =
    modality.size + contract.size + hours.size + locations.size;

  function resetAll() {
    setModality(new Set());
    setContract(new Set());
    setHours(new Set());
    setLocations(new Set());
  }

  return (
    <div className="space-y-5">
      {/* Toolbar — two icon-only square buttons matching the ATS
          chrome. Search expands inline on click; Filtros opens a
          popover anchored to its trigger. */}
      <div className="flex items-center gap-2">
        <ExpandingSearch
          value={q}
          onChange={setQ}
          placeholder={t("careers.searchPlaceholder")}
          clearLabel={t("careers.clearSearch")}
        />
        <FiltersButton
          activeCount={activeFilterCount}
          onReset={activeFilterCount > 0 ? resetAll : undefined}
          label={t("careers.filters")}
          resetLabel={t("careers.reset")}
        >
          <FilterSection
            label={t("careers.facetModality")}
            clearLabel={t("careers.clear")}
            selectAllLabel={t("careers.selectAll")}
            options={MODALITY_KEYS.map((v) => ({
              value: v,
              label: t(`careers.modality.${v}`),
            }))}
            selected={modality}
            onChange={setModality}
          />
          <FilterSection
            label={t("careers.facetContract")}
            clearLabel={t("careers.clear")}
            selectAllLabel={t("careers.selectAll")}
            options={CONTRACT_KEYS.map((v) => ({
              value: v,
              label: t(`careers.contract.${v}`),
            }))}
            selected={contract}
            onChange={setContract}
          />
          <FilterSection
            label={t("careers.facetHours")}
            clearLabel={t("careers.clear")}
            selectAllLabel={t("careers.selectAll")}
            options={HOURS_KEYS.map((v) => ({
              value: v,
              label: t(`careers.hours.${v}`),
            }))}
            selected={hours}
            onChange={setHours}
          />
          <FilterSection
            label={t("careers.facetLocation")}
            clearLabel={t("careers.clear")}
            selectAllLabel={t("careers.selectAll")}
            options={locationOptions}
            selected={locations}
            onChange={setLocations}
          />
        </FiltersButton>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("careers.noResults")}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((j) => (
            <li key={j.id}>
              <Link
                href={`/careers/${wsSlug}/${j.slug}${suffix}`}
                className="group flex items-center gap-4 rounded-md border border-border bg-bg-1 px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-bg-2"
              >
                {j.show_company_in_posting && j.company_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={j.company_logo_url}
                    alt={j.company_name ?? ""}
                    className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-border"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {j.title}
                    </span>
                    {j.show_company_in_posting && j.company_name ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {j.company_name}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {j.work_modality ? (
                      <span>{modalityLabel(t, j.work_modality)}</span>
                    ) : null}
                    {j.contract_type ? (
                      <span>{contractLabel(t, j.contract_type)}</span>
                    ) : null}
                    {j.working_hours ? (
                      <span>{hoursLabel(t, j.working_hours)}</span>
                    ) : null}
                    {j.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {j.location}
                      </span>
                    ) : null}
                    {j.show_salary_in_posting &&
                    (j.salary_min || j.salary_max) ? (
                      <span className="text-foreground">
                        {formatSalary(
                          t,
                          j.salary_min,
                          j.salary_max,
                          j.salary_currency,
                          j.salary_frequency,
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span
                  aria-hidden
                  className="shrink-0 text-sm text-muted-foreground transition-colors group-hover:text-foreground"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Search button that collapses to a 32×32 icon when empty + unfocused,
 * expands inline to a 224px input on click. Mirrors the ATS's
 * `TableSearchFinder` chrome — same heights, same icon. Click-outside
 * collapses it again unless the candidate typed something (then we
 * keep the value visible so they don't lose context).
 */
function ExpandingSearch({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const expanded = focused || value.length > 0;

  useEffect(() => {
    if (!focused) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setFocused(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [focused]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setFocused(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label={placeholder}
        title={placeholder}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-bg-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-flex h-8 items-center">
      <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            setFocused(false);
            inputRef.current?.blur();
          }
        }}
        aria-label={placeholder}
        placeholder={placeholder}
        className="h-8 w-56 rounded-md border border-border bg-bg-1 pl-7 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label={clearLabel}
          className="absolute right-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Filtros trigger + popover. Same visual as the ATS's FiltersPopover:
 * 32×32 button with the sliders icon, count badge in the corner when
 * any facet is active, click-outside backdrop to dismiss, and a
 * "Restablecer" footer that clears every facet when `onReset` is
 * provided.
 */
function FiltersButton({
  activeCount,
  onReset,
  label,
  resetLabel,
  children,
}: {
  activeCount: number;
  onReset?: () => void;
  label: string;
  resetLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title={label}
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-bg-1 text-muted-foreground hover:bg-muted hover:text-foreground",
          activeCount > 0 && "border-accent/50 bg-accent/5 text-foreground",
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {activeCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-medium text-fg-on-accent tabular-nums">
            {activeCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
            <div className="max-h-[28rem] overflow-y-auto">{children}</div>
            {onReset ? (
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={onReset}
                  className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {resetLabel}
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * One facet inside the filters popover. Header row with section
 * label + inline "Limpiar" button, "Seleccionar todos" checkbox, and
 * a list of options. Hides itself entirely when the facet has zero
 * options (e.g. no jobs have a location).
 */
function FilterSection({
  label,
  clearLabel,
  selectAllLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  clearLabel: string;
  selectAllLabel: string;
  options: Array<{ value: string; label: string }>;
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  if (options.length === 0) return null;
  const count = selected.size;
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span>{label}</span>
        {count > 0 ? (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="text-muted-foreground hover:text-foreground"
          >
            {clearLabel}
          </button>
        ) : null}
      </div>
      <div className="py-1">
        <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
          <input
            type="checkbox"
            checked={count === options.length && count > 0}
            ref={(el) => {
              if (el) el.indeterminate = count > 0 && count < options.length;
            }}
            onChange={() => {
              if (count === options.length) onChange(new Set());
              else onChange(new Set(options.map((o) => o.value)));
            }}
            className="h-3.5 w-3.5"
          />
          <span className="truncate">{selectAllLabel}</span>
        </label>
        {options.map((o) => {
          const checked = selected.has(o.value);
          return (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = new Set(selected);
                  if (checked) next.delete(o.value);
                  else next.add(o.value);
                  onChange(next);
                }}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function formatSalary(
  t: TFunction,
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
        ? t("careers.salaryFrom", { amount: f(min) })
        : max
          ? t("careers.salaryUpTo", { amount: f(max) })
          : null;
  if (!range) return "";
  const freq = FREQ_KEYS[frequency] ? t(`careers.${FREQ_KEYS[frequency]}`) : "";
  return `${range} ${cur}${freq}`;
}
