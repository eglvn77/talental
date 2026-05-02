"use client";
import { useState, type ReactNode } from "react";
import { LayoutGrid, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";

type View = "table" | "kanban";

export function PipelineSwitcher({
  tableView,
  kanbanView,
  updatedLabel,
}: {
  tableView: ReactNode;
  kanbanView: ReactNode;
  updatedLabel: string | null;
}) {
  const [view, setView] = useState<View>("table");

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <ViewToggle view={view} onChange={setView} />
        {updatedLabel ? (
          <p className="text-xs text-muted-foreground">Updated {updatedLabel}</p>
        ) : null}
      </div>
      {view === "table" ? tableView : kanbanView}
    </>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-md border border-border bg-background p-1"
      role="tablist"
      aria-label="View"
    >
      <ToggleButton
        active={view === "table"}
        onClick={() => onChange("table")}
        label="Table view"
      >
        <LayoutList className="size-3.5" />
      </ToggleButton>
      <ToggleButton
        active={view === "kanban"}
        onClick={() => onChange("kanban")}
        label="Kanban view"
      >
        <LayoutGrid className="size-3.5" />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
