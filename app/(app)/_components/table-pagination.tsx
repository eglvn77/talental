"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * URL-driven pagination + page-size selector shared by every table
 * landing (/candidates, /jobs, /companies, /contacts).
 *
 *   ?page=1            1-indexed
 *   ?per=25            25 | 50 | 100 | 200
 *
 * The component is presentation-only — it reads the current URL and
 * writes new values via router.replace (so back/forward work). The
 * parent server component reads the same searchParams to issue its
 * range() query.
 */

export const PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;
export const DEFAULT_PER_PAGE = 25;

export function parsePagination(searchParams: URLSearchParams | null): {
  page: number;
  per: number;
} {
  const pageRaw = Number(searchParams?.get("page") ?? "1");
  const perRaw = Number(searchParams?.get("per") ?? DEFAULT_PER_PAGE);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const per = (PER_PAGE_OPTIONS as readonly number[]).includes(perRaw)
    ? perRaw
    : DEFAULT_PER_PAGE;
  return { page, per };
}

export function TablePagination({
  total,
  className,
}: {
  /** Total row count across the entire (filtered) dataset. */
  total: number;
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { page, per } = parsePagination(searchParams);
  const totalPages = Math.max(1, Math.ceil(total / per));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * per + 1;
  const end = Math.min(total, safePage * per);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams ?? undefined);
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span>Mostrar</span>
        <Select
          value={String(per)}
          onChange={(v) => {
            // Reset to page 1 when per-page changes — otherwise you
            // could land on page 5 with only 3 actual pages of data.
            const next = new URLSearchParams(searchParams ?? undefined);
            next.set("per", v);
            next.set("page", "1");
            router.replace(`?${next.toString()}`, { scroll: false });
          }}
          options={PER_PAGE_OPTIONS.map((n) => ({
            value: String(n),
            label: String(n),
          }))}
          className="h-7 w-[64px] text-xs"
        />
        <span className="tabular-nums">
          {total === 0
            ? "Sin resultados"
            : `${start.toLocaleString()}–${end.toLocaleString()} de ${total.toLocaleString()}`}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setParam("page", String(Math.max(1, safePage - 1)))}
          disabled={safePage <= 1}
          aria-label="Anterior"
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 tabular-nums">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() =>
            setParam("page", String(Math.min(totalPages, safePage + 1)))
          }
          disabled={safePage >= totalPages}
          aria-label="Siguiente"
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
