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

export function VistaPopover({
  view,
  onViewChange,
  columns,
  hidden,
  onHiddenChange,
  onReset,
}: {
  view: VistaView;
  onViewChange: (v: VistaView) => void;
  /** Toggleable columns for the list view. */
  columns: ReadonlyArray<VistaColumnDef>;
  /** Set of column keys currently hidden. */
  hidden: Set<string>;
  onHiddenChange: (next: Set<string>) => void;
  /** Restores Kanban + every column shown. */
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toggleable = columns.filter((c) => !c.locked);
  const visibleToggleable = toggleable.filter((c) => !hidden.has(c.key));
  const allShown =
    toggleable.length > 0 && visibleToggleable.length === toggleable.length;
  const noneShown = visibleToggleable.length === 0;
  // Trigger picks up an accent border + count badge when the user
  // has hidden any toggleable columns.
  const totalDivergence = hidden.size;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Vista"
        title="Vista"
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          totalDivergence > 0 && "border-accent/50 bg-accent/5 text-foreground",
        )}
      >
        <Settings2 className="h-3.5 w-3.5" />
        {totalDivergence > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-medium text-fg-on-accent tabular-nums">
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
