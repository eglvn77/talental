"use client";

import { useState } from "react";
import { Kanban, List, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Vista submenu — Leonar-inspired Display panel. One button on the
 * right of the job-tracking chrome opens a popover that owns both
 * the view mode (Kanban / Lista) and the column visibility for the
 * list view.
 *
 * Compared to the previous inline "Kanban | Lista" toggle, this:
 *   - Cleans up the top bar (one icon button instead of two
 *     visible toggles)
 *   - Houses the per-column visibility checklist which used to be a
 *     separate dropdown
 *   - Stays right-aligned next to Filtros so the two adjustment
 *     popovers mirror each other
 *
 * The active column count badge tells the user at a glance whether
 * they've hidden anything off the default view.
 */
export type VistaView = "kanban" | "list";

export type VistaColumnDef = {
  key: string;
  label: string;
  /** Columns the user can't hide (the primary identity column). */
  locked?: boolean;
};

export type VistaFilterDef = {
  /** Display name in the popover header for the section. */
  label: string;
  /** Available values. Empty → section hidden. */
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
};

export function VistaPopover({
  view,
  onViewChange,
  columns,
  hidden,
  onHiddenChange,
  filters,
  onReset,
}: {
  view: VistaView;
  onViewChange: (v: VistaView) => void;
  /** Toggleable columns for the list view. */
  columns: ReadonlyArray<VistaColumnDef>;
  /** Set of column keys currently hidden. */
  hidden: Set<string>;
  onHiddenChange: (next: Set<string>) => void;
  /**
   * Filter sections rendered inside the popover. Each is a labelled
   * multi-select. Pass an empty array (or omit) to hide the Filtros
   * block entirely. Stage filtering stays as <StageChips> outside.
   */
  filters?: ReadonlyArray<VistaFilterDef>;
  /** Restores Kanban + every column shown + every filter cleared. */
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toggleable = columns.filter((c) => !c.locked);
  const visibleToggleable = toggleable.filter((c) => !hidden.has(c.key));
  const allShown =
    toggleable.length > 0 && visibleToggleable.length === toggleable.length;
  const noneShown = visibleToggleable.length === 0;
  // Aggregate badge — anything that diverges from the default state
  // (columns hidden + filters active) bumps the count on the trigger
  // so the user can see at a glance that the view is configured.
  const activeFilterCount = (filters ?? []).reduce(
    (sum, f) => sum + f.selected.size,
    0,
  );
  const totalDivergence = hidden.size + activeFilterCount;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Vista"
        title="Vista"
        className={cn(
          "relative inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-1 px-2.5 text-xs text-fg-2 hover:bg-bg-2 hover:text-fg-1",
          totalDivergence > 0 && "border-accent/50 bg-accent/5 text-fg-1",
        )}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Vista
        {totalDivergence > 0 ? (
          <span className="rounded bg-accent px-1 font-mono text-[10px] tabular-nums text-fg-on-accent">
            {totalDivergence}
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
          <div className="absolute right-0 top-full z-20 mt-1 max-h-[36rem] w-72 overflow-y-auto rounded-md border border-border bg-bg-1 shadow-dropdown">
            <div className="border-b border-border-soft bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              Vista
            </div>
            <div className="flex gap-1 p-2">
              <ViewBtn
                active={view === "list"}
                onClick={() => onViewChange("list")}
                label="Lista"
              >
                <List className="h-3.5 w-3.5" />
              </ViewBtn>
              <ViewBtn
                active={view === "kanban"}
                onClick={() => onViewChange("kanban")}
                label="Kanban"
              >
                <Kanban className="h-3.5 w-3.5" />
              </ViewBtn>
            </div>
            {filters && filters.length > 0 ? (
              <FilterSections filters={filters} />
            ) : null}
            {view === "list" && columns.length > 0 ? (
              <>
                <div className="border-y border-border-soft bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                  Columnas
                </div>
                <div className="py-1">
                  <label className="flex cursor-pointer items-center gap-2 border-b border-border-soft px-3 py-1.5 text-xs font-medium hover:bg-bg-3">
                    <input
                      type="checkbox"
                      checked={allShown}
                      ref={(el) => {
                        if (el) el.indeterminate = !allShown && !noneShown;
                      }}
                      onChange={() => {
                        if (allShown) {
                          // Hide everything toggleable.
                          onHiddenChange(new Set(toggleable.map((c) => c.key)));
                        } else {
                          onHiddenChange(new Set());
                        }
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate">Mostrar todas</span>
                  </label>
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
                            : "cursor-pointer hover:bg-bg-3",
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
                            onHiddenChange(next);
                          }}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate">{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}
            {onReset ? (
              <div className="border-t border-border-soft">
                <button
                  type="button"
                  onClick={onReset}
                  className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-bg-3 hover:text-fg-1"
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
 * One filter section inside the Vista popover. Multi-select checkbox
 * list with a "Seleccionar todos" master toggle. Hidden when the
 * available-options list is empty (no point showing a header above
 * nothing).
 */
function FilterSections({ filters }: { filters: ReadonlyArray<VistaFilterDef> }) {
  const visible = filters.filter((f) => f.options.length > 0);
  if (visible.length === 0) return null;
  return (
    <>
      <div className="border-y border-border-soft bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
        Filtros
      </div>
      {visible.map((f) => {
        const count = f.selected.size;
        const allSelected = count === f.options.length && count > 0;
        const noneSelected = count === 0;
        return (
          <div
            key={f.label}
            className="border-b border-border-soft last:border-b-0"
          >
            <div className="flex items-center justify-between px-3 pb-1 pt-1.5 text-[11px] font-medium text-fg-2">
              <span>{f.label}</span>
              {count > 0 ? (
                <button
                  type="button"
                  onClick={() => f.onChange(new Set())}
                  className="text-fg-muted hover:text-fg-1"
                >
                  Limpiar
                </button>
              ) : null}
            </div>
            <div className="pb-1">
              <label className="flex cursor-pointer items-center gap-2 border-b border-border-soft/60 px-3 py-1 text-xs font-medium hover:bg-bg-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && !noneSelected;
                  }}
                  onChange={() => {
                    if (allSelected) f.onChange(new Set());
                    else f.onChange(new Set(f.options.map((o) => o.value)));
                  }}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate">Seleccionar todos</span>
              </label>
              {f.options.map((o) => {
                const checked = f.selected.has(o.value);
                return (
                  <label
                    key={o.value}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs hover:bg-bg-3"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(f.selected);
                        if (checked) next.delete(o.value);
                        else next.add(o.value);
                        f.onChange(next);
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
      })}
    </>
  );
}

function ViewBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors",
        active
          ? "bg-fg-1 font-medium text-bg-1"
          : "text-fg-2 hover:bg-bg-3 hover:text-fg-1",
      )}
    >
      {children}
      {label}
    </button>
  );
}
