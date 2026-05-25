"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** Optional secondary text rendered muted, to the right of the
   *  label. Mirrors the company domain in the CompanyCombobox. */
  hint?: string;
  disabled?: boolean;
};

/**
 * Single-select dropdown styled to match the CompanyCombobox / Talental
 * design system. The whole point of this primitive is to replace every
 * native `<select>` in the app so dropdowns feel consistent:
 *
 *   - Closed: button trigger with the selected label + chevron. No
 *     reliance on the OS-native dropdown rendering (which we can't
 *     style consistently across browsers).
 *   - Open: optional search input at the top, scrollable option list
 *     below, an optional "Create new …" footer action.
 *   - Outside click closes the dropdown without ever mutating the
 *     selection — clicking the chevron and clicking away can never
 *     blank the value.
 *   - Disabled state grays out the trigger and blocks open.
 *
 * Pass `searchable` to surface the filter input (useful for ~15+
 * options). For short lists keep it false so the focus lands on the
 * options directly. Pass `onCreate` to surface a "+ Create new…"
 * action at the bottom.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Selecciona una opción",
  className,
  triggerClassName,
  disabled = false,
  searchable = false,
  onCreate,
  createLabel = "Crear nuevo",
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Constrains the outer wrapper. Use it to cap the picker width or
   *  share alignment with neighboring fields. */
  className?: string;
  /** Custom classes for the trigger button only. */
  triggerClassName?: string;
  disabled?: boolean;
  /** Render a filter input above the options list. */
  searchable?: boolean;
  /** Surfaces a "+ Create new" affordance at the bottom of the
   *  dropdown. Receives the current search query (or empty string) so
   *  the caller can pre-fill a creation modal. */
  onCreate?: (currentQuery: string) => void;
  /** Override the default "Crear nuevo" label. */
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter options by query (when searchable). The matcher is intentionally
  // lax (substring case-insensitive across label + hint) so users find what
  // they want without thinking about exact wording.
  const filtered = searchable
    ? options.filter((o) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          o.label.toLowerCase().includes(q) ||
          (o.hint?.toLowerCase().includes(q) ?? false)
        );
      })
    : options;

  // Outside click closes the dropdown without changing value.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Focus the search input (if any) when the dropdown opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Reset highlight whenever the filtered list changes — otherwise the
  // index could point past the end and Enter would do nothing.
  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function pick(o: SelectOption) {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(filtered[highlight]);
    }
  }

  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div className={cn("relative", className)} ref={wrapRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (!open && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-left text-sm transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
          triggerClassName,
        )}
      >
        <span
          className={cn(
            "flex-1 truncate",
            !selected && "text-muted-foreground",
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        {selected?.hint ? (
          <span className="truncate text-xs text-muted-foreground">
            {selected.hint}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-background shadow-dropdown"
        >
          {searchable ? (
            <div className="border-b border-border p-2">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar…"
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              />
            </div>
          ) : null}

          {/* onMouseLeave resets the highlight so it doesn't bleed
              when the pointer drops onto the create button below.
              Same fix as the company combobox. */}
          <div
            ref={listRef}
            className="max-h-72 overflow-y-auto"
            onMouseLeave={() => setHighlight(-1)}
            onKeyDown={onKeyDown}
            tabIndex={searchable ? undefined : 0}
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Sin coincidencias.
              </div>
            ) : (
              filtered.map((o, i) => {
                const active = i === highlight;
                const isSelected = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={o.disabled}
                    onClick={() => pick(o)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                      active ? "bg-muted" : "hover:bg-muted",
                      isSelected && "font-medium",
                      o.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {o.hint}
                      </span>
                    ) : null}
                    {isSelected ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-accent"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {onCreate ? (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => {
                  onCreate(query);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
                {createLabel}
                {query.trim() ? (
                  <span className="text-muted-foreground">“{query}”</span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
