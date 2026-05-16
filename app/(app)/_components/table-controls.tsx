"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Building blocks for client-side filterable + sortable tables. Used by
 * /jobs, /companies, and the per-job candidates list view. Each table
 * owns its own filter/sort state and feeds it back into a useMemo'd
 * derivation of the visible rows.
 *
 * Conventions:
 *  - Filters live as `Set<string>` of selected values
 *  - Sort state is `{ key: TKey; dir: "asc" | "desc" }`
 *  - All filtering and sorting happens in memory — fine for hundreds of
 *    rows, would need server-side pagination if we ever grow past that.
 */

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir };

/**
 * `useTableSort` returns a `[state, toggle]` pair. Clicking the same key
 * flips direction; clicking a new key resets direction (asc for string
 * keys, desc for everything else by default).
 */
export function useTableSort<K extends string>(
  initial: SortState<K>,
  ascByDefaultFor: ReadonlyArray<K> = [],
) {
  const [state, setState] = useState<SortState<K>>(initial);
  function toggle(k: K) {
    setState((cur) => {
      if (cur.key === k) {
        return { key: k, dir: cur.dir === "asc" ? "desc" : "asc" };
      }
      const startAsc = ascByDefaultFor.includes(k);
      return { key: k, dir: startAsc ? "asc" : "desc" };
    });
  }
  return [state, toggle] as const;
}

/**
 * Sortable `<th>` cell. Click toggles direction; an active column shows
 * the chevron and bumps the label colour.
 */
export function SortHeader<K extends string>({
  label,
  k,
  state,
  onToggle,
  className,
}: {
  label: string;
  k: K;
  state: SortState<K>;
  onToggle: (k: K) => void;
  className?: string;
}) {
  const active = state.key === k;
  return (
    <th className={cn("px-3 py-2 text-left font-medium", className)}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          state.dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );
}

/**
 * Multi-select filter dropdown. Renders as a button that shows a popover
 * with checkboxes. Selected values are surfaced as a count badge on the
 * trigger. Designed to be a controlled component — owner holds the
 * Set<string> state.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  const count = selected.size;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted",
          count > 0 && "border-brand/50 bg-brand/5",
        )}
      >
        {label}
        {count > 0 ? (
          <span className="rounded bg-muted px-1.5 text-[10px]">{count}</span>
        ) : null}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-lg">
            <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <input
                type="checkbox"
                checked={count === options.length}
                ref={(el) => {
                  if (el) el.indeterminate = count > 0 && count < options.length;
                }}
                onChange={() => {
                  if (count === options.length) onChange(new Set());
                  else onChange(new Set(options.map((o) => o.value)));
                }}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">Seleccionar todos</span>
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
            {count > 0 ? (
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={() => onChange(new Set())}
                  className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                >
                  Limpiar
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
 * Free-text search input styled to match the filter chips.
 */
export function TableSearch({
  value,
  onChange,
  placeholder = "Buscar…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-8 w-56 rounded-md border border-border bg-background px-2.5 text-xs"
    />
  );
}

/**
 * Format an ISO timestamp as a relative-time string in Spanish.
 * Shared by jobs, candidates, etc.
 */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "hace unos segundos";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `hace ${diffDay} día${diffDay === 1 ? "" : "s"}`;
  const diffMon = Math.round(diffDay / 30);
  if (diffMon < 12) return `hace ${diffMon} mes${diffMon === 1 ? "" : "es"}`;
  const diffYr = Math.round(diffMon / 12);
  return `hace ${diffYr} año${diffYr === 1 ? "" : "s"}`;
}

// ============================================================
// localStorage persistence — preserves filters across refresh.
// ============================================================

function readLS<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLS<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — silently drop */
  }
}

/** String state persisted to localStorage. */
export function useLocalString(
  key: string,
  initial = "",
): [string, (v: string) => void] {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const stored = readLS<string>(key);
    if (stored !== null) setV(stored);
  }, [key]);
  function update(next: string) {
    setV(next);
    writeLS(key, next);
  }
  return [v, update];
}

/** Set<string> state persisted to localStorage. */
export function useLocalSet(
  key: string,
): [Set<string>, (v: Set<string>) => void] {
  const [v, setV] = useState<Set<string>>(new Set());
  useEffect(() => {
    const stored = readLS<string[]>(key);
    if (stored) setV(new Set(stored));
  }, [key]);
  function update(next: Set<string>) {
    setV(next);
    writeLS(key, Array.from(next));
  }
  return [v, update];
}

/** Sort state persisted to localStorage. */
export function useLocalSort<K extends string>(
  key: string,
  initial: SortState<K>,
  ascByDefaultFor: ReadonlyArray<K> = [],
) {
  const [state, setState] = useState<SortState<K>>(initial);
  useEffect(() => {
    const stored = readLS<SortState<K>>(key);
    if (stored) setState(stored);
  }, [key]);
  function toggle(k: K) {
    setState((cur) => {
      const next: SortState<K> =
        cur.key === k
          ? { key: k, dir: cur.dir === "asc" ? "desc" : "asc" }
          : { key: k, dir: ascByDefaultFor.includes(k) ? "asc" : "desc" };
      writeLS(key, next);
      return next;
    });
  }
  return [state, toggle] as const;
}

/**
 * Apply a substring match across multiple string fields, case-insensitive.
 * Empty query returns true (no-op).
 */
export function useTextFilter<T>(
  rows: T[],
  query: string,
  fields: (row: T) => Array<string | null | undefined>,
): T[] {
  const q = query.trim().toLowerCase();
  return useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => {
      for (const f of fields(r)) {
        if (f && f.toLowerCase().includes(q)) return true;
      }
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q]);
}
