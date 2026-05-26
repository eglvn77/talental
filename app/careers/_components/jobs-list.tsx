"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { CareersJobListItem } from "../_lib/data";

const MODALITY_LABELS: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
};

const FREQ_LABELS: Record<string, string> = {
  monthly: "/mes",
  annual: "/año",
  weekly: "/semana",
  hourly: "/hora",
};

/**
 * Filterable list of published vacantes on the workspace landing.
 * Two filters live above the grid:
 *   - free-text search (matches title + location)
 *   - modalidad de trabajo (remote / hybrid / onsite)
 * Both are client-side because the dataset is small (<200 published
 * jobs per agency in practice). No URL state for now — refresh keeps
 * the filters because they're query-cheap to re-apply on mount;
 * future versions can promote them to `?modality=remote&q=…` for
 * shareability.
 */
export function JobsList({
  jobs,
  wsSlug,
}: {
  jobs: CareersJobListItem[];
  /** Workspace slug, used to construct the per-job link. */
  wsSlug: string;
}) {
  const [q, setQ] = useState("");
  const [modality, setModality] = useState<string>("");

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (modality && j.work_modality !== modality) return false;
      if (!ql) return true;
      return (
        j.title.toLowerCase().includes(ql) ||
        (j.location ?? "").toLowerCase().includes(ql)
      );
    });
  }, [jobs, q, modality]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca por título o ubicación…"
            className="h-9 w-full rounded-md border border-border bg-bg-1 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        <Select
          value={modality}
          onChange={setModality}
          className="w-44"
          options={[
            { value: "", label: "Cualquier modalidad" },
            { value: "remote", label: "Remoto" },
            { value: "hybrid", label: "Híbrido" },
            { value: "onsite", label: "Presencial" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Sin resultados — prueba con otros filtros.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((j) => (
            <li key={j.id}>
              <Link
                href={`/careers/${wsSlug}/${j.slug}`}
                className="block rounded-lg border border-border bg-bg-1 p-4 transition-colors hover:border-foreground/15 hover:bg-bg-2"
              >
                <div className="flex items-start gap-3">
                  {j.show_company_in_posting && j.company_logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={j.company_logo_url}
                      alt={j.company_name ?? ""}
                      className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-border"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {j.title}
                    </div>
                    {j.show_company_in_posting && j.company_name ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {j.company_name}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {j.work_modality ? (
                        <span>
                          {MODALITY_LABELS[j.work_modality] ?? j.work_modality}
                        </span>
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
                            j.salary_min,
                            j.salary_max,
                            j.salary_currency,
                            j.salary_frequency,
                          )}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
    min && max ? `${f(min)} – ${f(max)}` : min ? `Desde ${f(min)}` : max ? `Hasta ${f(max)}` : null;
  if (!range) return "";
  return `${range} ${cur}${FREQ_LABELS[frequency] ?? ""}`;
}
