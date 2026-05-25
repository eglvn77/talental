"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useListNav } from "@/lib/use-list-nav";
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
          count > 0 && "border-accent/50 bg-accent/5",
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
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-dropdown">
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
 * Free-text search. Collapses to a magnifier icon button until clicked
 * or until there's text to display. The placeholder/label is only used
 * for accessibility — the trigger shows nothing but the icon.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const expanded = focused || value.length > 0;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setFocused(true);
          // Defer focus to next tick so the input is mounted.
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label={placeholder}
        title={placeholder}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="relative inline-flex h-8 items-center">
      <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={placeholder}
        className="h-8 w-56 rounded-md border border-border bg-background pl-7 pr-7 text-xs"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Limpiar búsqueda"
          className="absolute right-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Per-scope recent-searches history (last N queries the user
 * clicked through). Stored under `tlt.search.history.<key>` so every
 * search bar in the app gets its own list — /candidates' history
 * stays separate from /jobs', global Cmd+K stays separate from both.
 *
 * `record(q)` is meant to be called when the user actually picks a
 * result (so noise from half-typed strings doesn't pollute the list).
 * Duplicates are deduped and the newest entry floats to the top.
 */
export function useSearchHistory(key: string, max = 5) {
  const storageKey = `tlt.search.history.${key}`;
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setRecent(parsed.filter((s): s is string => typeof s === "string"));
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  function record(q: string) {
    const t = q.trim();
    if (t.length === 0) return;
    setRecent((cur) => {
      const next = [t, ...cur.filter((s) => s !== t)].slice(0, max);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }
  function clear() {
    setRecent([]);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }
  return { recent, record, clear };
}

/**
 * Result shape consumed by `<TableSearchFinder>`. Caller pre-filters
 * the data against the search query and passes the matching rows
 * here — the component only renders the dropdown and handles
 * navigation/selection on click.
 */
export type FinderResult = {
  /** Stable unique key for the result list. */
  id: string;
  /** Primary line (e.g. candidate name, job title). */
  title: string;
  /** Optional secondary line (e.g. email, company, status). */
  subtitle?: string;
  /** Optional right-aligned chip (stage pill, status badge, etc.). */
  badge?: React.ReactNode;
  /** Navigation target. Use `?param=id` for slideovers. */
  href?: string;
  /** Optional custom click handler (overrides href). */
  onSelect?: () => void;
};

/**
 * Search-as-finder. Drop-in replacement for `<TableSearch>` whenever
 * the typing-to-filter UX should be replaced with typing-to-jump.
 * Renders a dropdown of matches right below the input; clicking a
 * row navigates (`href`) or fires `onSelect`. The visible table is
 * NOT filtered by the query — filters live in `<FiltersPopover>` for
 * shaping the view, the finder is for jumping to specific records
 * regardless of what's currently visible.
 *
 * The caller owns the filtering logic (so it can use `useTextFilter`
 * against its own data shape) and passes the matching slice in
 * `results`. The component handles trigger / expansion / dropdown /
 * keyboard / outside-click.
 */
export function TableSearchFinder({
  value,
  onChange,
  results,
  placeholder = "Buscar…",
  emptyLabel = "Sin resultados.",
  recent,
  onRecordSearch,
  onClearHistory,
}: {
  value: string;
  onChange: (v: string) => void;
  /**
   * Pre-filtered matches for the current query, ordered by relevance
   * or recency. Cap is the caller's choice.
   */
  results: FinderResult[];
  placeholder?: string;
  /** Shown when the query has content but `results` is empty. */
  emptyLabel?: string;
  /**
   * Optional recent-searches list (newest first). When the user
   * focuses the input with no query typed, this is shown as the
   * dropdown content — click a row to populate the input with that
   * string. Get it from `useSearchHistory(scope)`.
   */
  recent?: string[];
  /**
   * Called right before navigation with the current query, so the
   * caller can record it into history. Wire to `useSearchHistory`'s
   * `record` fn. Optional — omit to disable history recording for
   * this finder.
   */
  onRecordSearch?: (q: string) => void;
  /**
   * Wipe the recent-searches list. Renders a "Limpiar" button at
   * the bottom of the recent dropdown when provided.
   */
  onClearHistory?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(value.length > 0);
  const expanded = focused || value.length > 0;
  const q = value.trim();

  // Click-outside closes the results panel without clearing the query.
  useEffect(() => {
    if (!resultsOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setResultsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [resultsOpen]);

  function open(r: FinderResult) {
    setResultsOpen(false);
    setFocused(false);
    onRecordSearch?.(value);
    if (r.onSelect) {
      r.onSelect();
    } else if (r.href) {
      router.push(r.href, { scroll: false });
    }
  }

  // Keyboard navigation: ↑/↓ moves the highlight, Enter picks. The
  // hook resets the highlight whenever the results array changes so
  // the top match is always the default target.
  const { highlight, setHighlight, onKeyDown: navKeys } = useListNav(
    results,
    open,
  );

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
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
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
        onChange={(e) => {
          onChange(e.target.value);
          setResultsOpen(true);
        }}
        onFocus={() => {
          setFocused(true);
          // Open the dropdown on focus so the recent-searches panel
          // shows immediately. The body conditionally renders recents
          // vs results vs empty state based on `value` and `recent`.
          setResultsOpen(true);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setResultsOpen(false);
            inputRef.current?.blur();
            return;
          }
          navKeys(e);
        }}
        aria-label={placeholder}
        placeholder={placeholder}
        className="h-8 w-56 rounded-md border border-border bg-background pl-7 pr-7 text-xs"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setResultsOpen(false);
            inputRef.current?.focus();
          }}
          aria-label="Limpiar búsqueda"
          className="absolute right-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}

      {resultsOpen ? (
        <div className="absolute right-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
          {q.length === 0 ? (
            // No query yet → show recent searches (if any) so the
            // user can re-run a previous search with one click.
            recent && recent.length > 0 ? (
              <>
                <div className="flex items-center justify-between px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>Recientes</span>
                  {onClearHistory ? (
                    <button
                      type="button"
                      onClick={onClearHistory}
                      className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground hover:text-foreground"
                    >
                      Limpiar
                    </button>
                  ) : null}
                </div>
                <ul className="max-h-[60vh] overflow-y-auto pb-1">
                  {recent.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(r);
                          inputRef.current?.focus();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/60"
                      >
                        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                Empieza a escribir para buscar.
              </div>
            )
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              {emptyLabel}
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => open(r)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                      i === highlight
                        ? "bg-muted"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {r.title}
                      </div>
                      {r.subtitle ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {r.subtitle}
                        </div>
                      ) : null}
                    </div>
                    {r.badge ? (
                      <span className="ml-2 mt-0.5 shrink-0">{r.badge}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Container popover that groups multiple `<FilterSection>` children
 * behind a single "Filtros" icon button. Shows a count badge equal to
 * the sum of currently-selected options across all sections.
 *
 * Pass the per-section state as children (FilterSection elements);
 * the popover only handles open/close + the count badge.
 */
export function FiltersPopover({
  activeCount,
  onReset,
  children,
}: {
  /** Total number of selected options across all filter sections. */
  activeCount: number;
  /** Optional reset handler — when provided, footer shows "Restablecer" */
  onReset?: () => void;
  /** Section elements rendered inside the popover. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Filtros"
        title="Filtros"
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
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
          <div className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-md border border-border bg-background shadow-dropdown">
            <div className="max-h-[28rem] overflow-y-auto">{children}</div>
            {onReset ? (
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={onReset}
                  className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Restablecer
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
 * One filter section inside `<FiltersPopover>`. Renders a section
 * header + checkbox list inline (no nested popover). Hides itself
 * when there are zero options to choose from.
 */
export function FilterSection({
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
            Limpiar
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
      </div>
    </div>
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

/**
 * Set<string> state persisted to localStorage.
 *
 * `defaults` is the value used when nothing is stored yet (e.g. first
 * load, or after `reset()` was called). An empty selection that the
 * user explicitly cleared persists as `[]` and is distinct from "no
 * preference saved yet" — so the default only kicks in on a truly
 * fresh state.
 *
 * Returns `[value, set, reset]`. `reset()` restores `defaults` and
 * writes it back to storage so subsequent reloads see the default.
 */
export function useLocalSet(
  key: string,
  defaults: ReadonlyArray<string> = [],
): [Set<string>, (v: Set<string>) => void, () => void] {
  const [v, setV] = useState<Set<string>>(new Set(defaults));
  useEffect(() => {
    const stored = readLS<string[]>(key);
    if (stored !== null) setV(new Set(stored));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  function update(next: Set<string>) {
    setV(next);
    writeLS(key, Array.from(next));
  }
  function reset() {
    const d = new Set(defaults);
    setV(d);
    writeLS(key, Array.from(d));
  }
  return [v, update, reset];
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
 * Hidden-column state persisted to localStorage. Returns the set of
 * hidden column keys (so a missing key in storage means "shown" by
 * default — new columns appear without users having to opt in).
 *
 * Callers check `hidden.has(key)` before rendering the corresponding
 * `<th>` / `<td>`. Pass `initialHidden` to default-hide low-priority
 * columns.
 */
export function useLocalColumns<K extends string>(
  key: string,
  initialHidden: ReadonlyArray<K> = [],
): [Set<K>, (next: Set<K>) => void, () => void] {
  const [v, setV] = useState<Set<K>>(new Set(initialHidden));
  useEffect(() => {
    const stored = readLS<string[]>(key);
    if (stored !== null) setV(new Set(stored as K[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  function update(next: Set<K>) {
    setV(next);
    writeLS(key, Array.from(next));
  }
  function reset() {
    const d = new Set(initialHidden);
    setV(d);
    writeLS(key, Array.from(d));
  }
  return [v, update, reset];
}

/**
 * Column-visibility dropdown. Pair with `useLocalColumns`. Renders an
 * icon-only trigger with a popover of checkboxes per column. Columns
 * marked `locked` cannot be hidden (typically the primary identity
 * column — e.g. job title, company name).
 */
export function ColumnVisibilityMenu<K extends string>({
  columns,
  hidden,
  onChange,
  onReset,
}: {
  columns: ReadonlyArray<{ key: K; label: string; locked?: boolean }>;
  hidden: Set<K>;
  onChange: (next: Set<K>) => void;
  /** Optional reset handler — when provided, footer shows "Restablecer" */
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Columnas"
        title="Columnas"
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          hidden.size > 0 && "border-accent/50 bg-accent/5 text-foreground",
        )}
      >
        <Columns3 className="h-3.5 w-3.5" />
        {hidden.size > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-medium text-fg-on-accent tabular-nums">
            {hidden.size}
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
          <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-dropdown">
            {(() => {
              const toggleable = columns.filter((c) => c.locked !== true);
              const visibleToggleable = toggleable.filter(
                (c) => !hidden.has(c.key),
              );
              const allShown =
                toggleable.length > 0 &&
                visibleToggleable.length === toggleable.length;
              const noneShown = visibleToggleable.length === 0;
              return (
                <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={allShown}
                    ref={(el) => {
                      if (el) el.indeterminate = !allShown && !noneShown;
                    }}
                    onChange={() => {
                      // All shown → hide all toggleable. Otherwise show all.
                      if (allShown) {
                        onChange(new Set(toggleable.map((c) => c.key)));
                      } else {
                        onChange(new Set());
                      }
                    }}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">Mostrar todas</span>
                </label>
              );
            })()}
            {columns.map((c) => {
              const isHidden = hidden.has(c.key);
              const disabled = c.locked === true;
              return (
                <label
                  key={c.key}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs",
                    disabled
                      ? "cursor-not-allowed text-muted-foreground"
                      : "cursor-pointer hover:bg-muted",
                  )}
                  title={disabled ? "Columna principal" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    disabled={disabled}
                    onChange={() => {
                      const next = new Set(hidden);
                      if (isHidden) next.delete(c.key);
                      else next.add(c.key);
                      onChange(next);
                    }}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{c.label}</span>
                </label>
              );
            })}
            {onReset ? (
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={onReset}
                  className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Restablecer
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

/**
 * Card-style outer chrome shared by every list view (/jobs, /companies,
 * /candidates). Renders the rounded border, the muted thead band, the
 * divider tbody, and the centered empty-state row.
 *
 * Tables still own their own `<tr>`s — headers are passed as `head`
 * (an arbitrary node, usually a sequence of <SortHeader> + <th>),
 * data rows as `children` (must be `<tr>`s). When `isEmpty` is true,
 * `children` is ignored and the empty-state row renders instead.
 */
export function DataTable({
  head,
  children,
  isEmpty,
  emptyMessage,
  colSpan,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  isEmpty: boolean;
  emptyMessage: string;
  /** Number of columns in the table, used for the empty-state row colSpan. */
  colSpan: number;
}) {
  return (
    // overflow-x-auto lets wide tables (the /finances P&L view has
    // up to 15 columns, /jobs grows with custom fields, etc.) scroll
    // horizontally inside their card instead of forcing the page to
    // scroll. The rounded corners stay clipped because there's no
    // vertical overflow — only horizontal — and modern browsers
    // clip rounded borders along whichever axis they're hidden on.
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isEmpty ? (
            <tr>
              <td
                colSpan={colSpan}
                className="px-4 py-8 text-center text-xs text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Filter row above a `<DataTable>`. Layout: count chip pinned to the
 * left, control cluster (search, filters, columns) pushed to the right
 * via `ml-auto` on the controls wrapper. The new visual language is
 * icon-only triggers — see `TableSearch`, `FiltersPopover`, and
 * `ColumnVisibilityMenu`.
 */
export function TableFilterBar({
  shown,
  total,
  children,
}: {
  shown: number;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {shown} de {total}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {children}
      </div>
    </div>
  );
}
