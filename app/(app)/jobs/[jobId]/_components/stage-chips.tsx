"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ApplicationRow, PipelineStageRow } from "@/lib/hiring";

/**
 * Stage-chips row above the candidates view. Each chip shows the
 * stage name + a live count of applications in that stage. Click to
 * filter the list to that stage; click "Todas" to clear.
 *
 * Visual style matches the Distillate sidebar's active-nav inversion:
 *   active = ink fill on bone text (the editorial mark of "I'm here")
 *   inactive = bone canvas, fg-2 text, hover swaps to paper.
 *
 * The active chip's secondary count badge inverts to the surface
 * colour so it reads cleanly on the ink fill.
 *
 * Behaviour:
 *   - Selection is owned by the parent via `value` / `onChange` —
 *     stays in sync with the list view's stage filter.
 *   - "Todas" = null. Pass null to clear.
 *   - Counts come from the full applications array, not the
 *     post-filter slice, so the user can see how many candidates
 *     each stage holds at a glance even when the current list shows
 *     only one stage.
 */
export function StageChips({
  stages,
  applications,
  value,
  onChange,
}: {
  stages: PipelineStageRow[];
  applications: ApplicationRow[];
  /** Currently-selected stage id, or null for "Todas". */
  value: string | null;
  onChange: (stageId: string | null) => void;
}) {
  const countByStageId = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of applications) {
      if (a.stage_id) {
        m.set(a.stage_id, (m.get(a.stage_id) ?? 0) + 1);
      }
    }
    return m;
  }, [applications]);

  return (
    // overflow-x-auto + per-chip shrink-0 — long pipelines (10+
    // stages) scroll horizontally instead of wrapping onto a
    // second row that would stack with the table below.
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
      <Chip
        label="Todas"
        count={applications.length}
        active={value == null}
        onClick={() => onChange(null)}
      />
      {stages.map((s) => (
        <Chip
          key={s.id}
          label={s.name}
          count={countByStageId.get(s.id) ?? 0}
          active={value === s.id}
          onClick={() => onChange(s.id)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
        active
          ? "bg-fg-1 font-medium text-bg-1"
          : "text-fg-2 hover:bg-bg-3 hover:text-fg-1",
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={cn(
          "rounded px-1 font-mono text-[10px] tabular-nums",
          active ? "bg-bg-1/15 text-bg-1" : "bg-bg-3 text-fg-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}
